import type { Customer, CustomerType, Prisma } from '../../generated/prisma/client.js';
import { PointReason } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { getSettings, pointsFromAmount, redeemValue } from '../loyalty/loyalty.service.js';
import type {
  AdjustPointsInput,
  CreateCustomerInput,
  ListCustomersQuery,
  PointHistoryQuery,
  UpdateCustomerInput,
} from './customer.schema.js';
import { lowestTierId, syncTier } from './tier.js';

type Tx = Prisma.TransactionClient;
type CustomerWithType = Customer & { customerType: CustomerType };

const toDto = ({ birthday, ...c }: CustomerWithType) => ({
  ...c,
  birthday: birthday ? birthday.toISOString().slice(0, 10) : null,
});

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const PHONE_TAKEN = 'Số điện thoại đã tồn tại';

async function getOrThrow(db: Tx | typeof prisma, id: number) {
  const customer = await db.customer.findUnique({ where: { id }, include: { customerType: true } });
  if (!customer || !customer.isActive) throw new AppError(404, 'Không tìm thấy khách hàng');
  return customer;
}

export async function listCustomers(query: ListCustomersQuery) {
  const where: Prisma.CustomerWhereInput = {
    isActive: true,
    ...(query.typeId ? { customerTypeId: query.typeId } : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q.replace(/\s+/g, '') } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { customerType: true },
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);
  return { items: items.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getCustomer(id: number) {
  return toDto(await getOrThrow(prisma, id));
}

export async function createCustomer(input: CreateCustomerInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const typeId = await lowestTierId(tx);
      if (!typeId) throw new AppError(400, 'Chưa có loại khách hàng nào, hãy tạo loại khách hàng trước');
      const created = await tx.customer.create({
        data: {
          fullName: input.fullName,
          phone: input.phone,
          address: input.address ?? null,
          birthday: input.birthday ?? null,
          customerTypeId: typeId,
        },
        include: { customerType: true },
      });
      return toDto(created);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, PHONE_TAKEN);
    throw e;
  }
}

export async function updateCustomer(id: number, input: UpdateCustomerInput) {
  await getOrThrow(prisma, id);
  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: input,
      include: { customerType: true },
    });
    return toDto(updated);
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, PHONE_TAKEN);
    throw e;
  }
}

/** Khách đã có hóa đơn chỉ đặt isActive = false; chưa có thì xóa hẳn (PointLog xóa theo). */
export async function removeCustomer(id: number) {
  await getOrThrow(prisma, id);
  if ((await prisma.order.count({ where: { customerId: id } })) > 0) {
    await prisma.customer.update({ where: { id }, data: { isActive: false } });
    return;
  }
  await prisma.customer.delete({ where: { id } });
}

export async function getPointHistory(id: number, query: PointHistoryQuery) {
  await getOrThrow(prisma, id);
  const where = { customerId: id };
  const [items, total] = await Promise.all([
    prisma.pointLog.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.pointLog.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Quản lý điều chỉnh điểm thủ công. Chỉ đổi điểm hiện có, không đổi điểm tích lũy xét hạng. */
export async function adjustPoints(actorId: number, id: number, input: AdjustPointsInput) {
  return prisma.$transaction(async (tx) => {
    const customer = await getOrThrow(tx, id);
    if (customer.points + input.delta < 0) {
      throw new AppError(400, 'Điểm của khách không đủ để trừ');
    }
    await tx.customer.update({ where: { id }, data: { points: { increment: input.delta } } });
    await tx.pointLog.create({
      data: {
        customerId: id,
        delta: input.delta,
        reason: PointReason.ADJUST,
        note: input.note,
        createdById: actorId,
      },
    });
    return toDto(await getOrThrow(tx, id));
  });
}

// ---- Hàm cho module Order, chạy trong transaction thanh toán ----

/** Cộng điểm theo giá trị hóa đơn, ghi sổ và xét lại hạng. Trả về số điểm đã cộng. */
export async function earnPoints(tx: Tx, customerId: number, amount: number, orderId?: number) {
  const settings = await getSettings(tx);
  const earned = pointsFromAmount(settings, amount);
  if (earned <= 0) return 0;
  await tx.customer.update({
    where: { id: customerId },
    data: { points: { increment: earned }, lifetimePoints: { increment: earned } },
  });
  await tx.pointLog.create({
    data: {
      customerId,
      delta: earned,
      reason: PointReason.EARN,
      orderId,
      note: `Tỷ lệ áp dụng: ${settings.amountPerPoint}đ = 1 điểm`,
    },
  });
  await syncTier(tx, customerId);
  return earned;
}

/** Dùng điểm để giảm giá. Trả về số tiền được giảm (đã chặn theo mức tối đa của hóa đơn). */
export async function redeemPoints(
  tx: Tx,
  customerId: number,
  points: number,
  orderTotal: number,
  orderId?: number,
) {
  if (points <= 0) return 0;
  const settings = await getSettings(tx);
  if (!settings.isEnabled) throw new AppError(400, 'Chương trình tích điểm đang tắt');
  if (points < settings.minRedeemPoints) {
    throw new AppError(400, `Cần đổi tối thiểu ${settings.minRedeemPoints} điểm`);
  }
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new AppError(404, 'Không tìm thấy khách hàng');
  if (points > customer.points) throw new AppError(400, 'Điểm của khách không đủ');

  const discount = redeemValue(settings, points, orderTotal);
  await tx.customer.update({ where: { id: customerId }, data: { points: { decrement: points } } });
  await tx.pointLog.create({
    data: {
      customerId,
      delta: -points,
      reason: PointReason.REDEEM,
      orderId,
      note: `Tỷ lệ áp dụng: 1 điểm = ${settings.pointValue}đ, tối đa ${settings.maxRedeemPercent}% hóa đơn`,
    },
  });
  return discount;
}

/** Phần trăm giảm giá theo loại khách hàng hiện tại. */
export async function getDiscountPercent(tx: Tx | typeof prisma, customerId: number) {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    include: { customerType: true },
  });
  return customer?.customerType.discountPercent ?? 0;
}

export { syncTier };
