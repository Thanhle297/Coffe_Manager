import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { syncAllTiers } from '../customer/tier.js';
import type { CreateCustomerTypeInput, UpdateCustomerTypeInput } from './customerType.schema.js';

async function assertUnique(
  db: Pick<typeof prisma, 'customerType'>,
  input: { name?: string; minPoints?: number },
  exceptId?: number,
) {
  if (input.name !== undefined) {
    const dup = await db.customerType.findFirst({
      where: { name: input.name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (dup) throw new AppError(409, 'Tên loại khách hàng đã tồn tại');
  }
  if (input.minPoints !== undefined) {
    const dup = await db.customerType.findFirst({
      where: { minPoints: input.minPoints, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (dup) throw new AppError(409, 'Đã có loại khách hàng khác dùng ngưỡng điểm này');
  }
}

export async function listCustomerTypes() {
  const types = await prisma.customerType.findMany({
    orderBy: { minPoints: 'asc' },
    include: { _count: { select: { customers: true } } },
  });
  return types.map(({ _count, ...t }) => ({ ...t, customerCount: _count.customers }));
}

export async function createCustomerType(input: CreateCustomerTypeInput) {
  return prisma.$transaction(async (tx) => {
    await assertUnique(tx, input);
    const created = await tx.customerType.create({ data: input });
    await syncAllTiers(tx);
    return created;
  });
}

export async function updateCustomerType(id: number, input: UpdateCustomerTypeInput) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.customerType.findUnique({ where: { id } });
    if (!target) throw new AppError(404, 'Không tìm thấy loại khách hàng');
    await assertUnique(tx, input, id);
    const updated = await tx.customerType.update({ where: { id }, data: input });
    // Đổi ngưỡng thì phải xét lại hạng của toàn bộ khách.
    if (input.minPoints !== undefined && input.minPoints !== target.minPoints) await syncAllTiers(tx);
    return updated;
  });
}

export async function deleteCustomerType(id: number) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.customerType.findUnique({
      where: { id },
      include: { _count: { select: { customers: true } } },
    });
    if (!target) throw new AppError(404, 'Không tìm thấy loại khách hàng');
    if (target._count.customers > 0) {
      throw new AppError(409, 'Loại khách hàng này vẫn còn khách, không thể xóa');
    }
    if ((await tx.customerType.count()) <= 1) {
      throw new AppError(400, 'Phải còn ít nhất một loại khách hàng');
    }
    await tx.customerType.delete({ where: { id } });
    await syncAllTiers(tx);
  });
}
