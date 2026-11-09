import { Prisma } from '../../generated/prisma/client.js';
import { OrderStatus, Role, TableStatus } from '../../generated/prisma/enums.js';
import { todayVNString } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { earnPoints, redeemPoints } from '../customer/customer.service.js';
import { consumptionOf, mergeConsumption, resolveLine } from '../drink/menu.js';
import { money } from '../drink/recipe.js';
import { nextCode, withCodeRetry } from '../stock/codes.js';
import { usableSummary } from '../stock/lots.js';
import { deductForOrder, rangeWhere } from '../stock/stock.service.js';
import {
  MAX_ITEM_QTY,
  type AddItemInput,
  type ListOrdersQuery,
  type OpenOrderInput,
  type PayOrderInput,
  type UpdateItemInput,
} from './order.schema.js';
import { computeTotals } from './totals.js';

type Tx = Prisma.TransactionClient;
type Actor = { id: number; role: Role };
const Decimal = Prisma.Decimal;

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';

// ---------- Đọc ----------

const orderInclude = {
  table: { select: { id: true, name: true } },
  staff: { select: { id: true, fullName: true } },
  customer: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      points: true,
      customerType: { select: { id: true, name: true, discountPercent: true } },
    },
  },
  items: { orderBy: { id: 'asc' }, include: { toppings: { orderBy: { id: 'asc' } } } },
} satisfies Prisma.OrderInclude;

type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Chỉ Quản lý thấy giá vốn (giống Drink Q5). */
function orderDto(o: OrderFull, role: Role) {
  const showCost = role === Role.MANAGER;
  const items = o.items.map(({ unitCost, toppings, ...i }) => ({
    ...i,
    lineTotal: i.unitPrice * i.quantity,
    ...(showCost ? { unitCost: money(unitCost) } : {}),
    toppings: toppings.map(({ unitCost: tc, ...t }) => ({ ...t, ...(showCost ? { unitCost: money(tc) } : {}) })),
  }));
  return {
    ...o,
    items,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    ...(showCost
      ? { costTotal: money(o.items.reduce((s, i) => s.add(i.unitCost.mul(i.quantity)), new Decimal(0))) }
      : {}),
  };
}

const isTodayVN = (d: Date) => todayVNString(d) === todayVNString();

/** Nhân viên: xem mọi đơn đang mở và đơn trong ngày; đơn cũ hơn chỉ Quản lý xem. */
export async function getOrder(id: number, actor: Actor) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw new AppError(404, 'Không tìm thấy đơn');
  if (actor.role !== Role.MANAGER && order.status !== OrderStatus.OPEN && !isTodayVN(order.createdAt)) {
    throw new AppError(403, 'Bạn không có quyền xem hóa đơn này');
  }
  return orderDto(order, actor.role);
}

const detail = async (tx: Tx, id: number, actor: Actor) =>
  orderDto(await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude }), actor.role);

export async function listOrders(query: ListOrdersQuery, actor: Actor) {
  const isStaff = actor.role !== Role.MANAGER;
  const today = todayVNString();
  // Q6: nhân viên chỉ thấy hóa đơn của mình trong ngày.
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.tableId ? { tableId: query.tableId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(isStaff ? { staffId: actor.id } : query.staffId ? { staffId: query.staffId } : {}),
    ...(query.q ? { code: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const createdAt = isStaff ? rangeWhere(today, today) : rangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const sumPaid = !query.status || query.status === OrderStatus.PAID;
  const [rows, total, paid] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        table: { select: { id: true, name: true } },
        staff: { select: { id: true, fullName: true } },
        customer: { select: { id: true, fullName: true, phone: true } },
        items: { select: { quantity: true } },
      },
    }),
    prisma.order.count({ where }),
    sumPaid
      ? prisma.order.aggregate({ where: { ...where, status: OrderStatus.PAID }, _sum: { total: true }, _count: true })
      : null,
  ]);
  return {
    items: rows.map(({ items, ...o }) => ({ ...o, itemCount: items.reduce((s, i) => s + i.quantity, 0) })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    summary: { paidCount: paid?._count ?? 0, revenue: paid?._sum.total ?? 0 },
  };
}

// ---------- Hỗ trợ ghi ----------

const CLOSED_MESSAGE: Record<OrderStatus, string> = {
  OPEN: '',
  PAID: 'Đơn đã thanh toán, không thể thay đổi',
  CANCELLED: 'Đơn đã hủy, không thể thay đổi',
};

/** Khóa dòng đơn (FOR UPDATE) để thao tác ghi và thanh toán đồng thời không chen nhau. */
async function lockOpenOrder(tx: Tx, id: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new AppError(404, 'Không tìm thấy đơn');
  const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: { include: { toppings: true } } } });
  if (order.status !== OrderStatus.OPEN) throw new AppError(409, CLOSED_MESSAGE[order.status]);
  return order;
}

/** Tính lại tạm tính và trạng thái bàn (Q5: chưa có món = SELECTING, có món = OCCUPIED). */
async function refresh(tx: Tx, orderId: number, tableId: number) {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { quantity: true, unitPrice: true } });
  await tx.order.update({
    where: { id: orderId },
    data: { subtotal: items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) },
  });
  await tx.diningTable.update({
    where: { id: tableId },
    data: { status: items.length > 0 ? TableStatus.OCCUPIED : TableStatus.SELECTING },
  });
}

async function assertActiveCustomer(tx: Tx, customerId: number) {
  const c = await tx.customer.findUnique({ where: { id: customerId }, select: { isActive: true } });
  if (!c) throw new AppError(404, 'Không tìm thấy khách hàng');
  if (!c.isActive) throw new AppError(400, 'Khách hàng đã ngừng hoạt động');
}

/** Khóa nhận diện cấu hình topping của một ly để gộp dòng giống nhau (Q11). */
const toppingKey = (toppings: { toppingId: number; quantity: number }[]) =>
  toppings
    .map((t) => `${t.toppingId}x${t.quantity}`)
    .sort()
    .join(',');

type OrderWithItems = Awaited<ReturnType<typeof lockOpenOrder>>;

/** Nguyên liệu cần trừ cho cả đơn theo công thức hiện tại của size và topping. */
async function orderConsumption(tx: Tx, items: OrderWithItems['items']) {
  const lines = await Promise.all(
    items.map((i) =>
      consumptionOf(
        tx,
        { sizeId: i.sizeId, toppings: i.toppings.map((t) => ({ toppingId: t.toppingId, quantity: t.quantity })) },
        i.quantity,
      ),
    ),
  );
  return mergeConsumption(lines);
}

// ---------- Ghi ----------

export async function openOrder(actor: Actor, input: OpenOrderInput) {
  try {
    const id = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "DiningTable" WHERE id = ${input.tableId} FOR UPDATE`;
        if (locked.length === 0) throw new AppError(404, 'Không tìm thấy bàn');
        const table = await tx.diningTable.findUniqueOrThrow({ where: { id: input.tableId } });
        if (!table.isActive) throw new AppError(400, 'Bàn đã ngừng sử dụng');
        const open = await tx.order.findFirst({ where: { tableId: table.id, status: OrderStatus.OPEN } });
        if (open) throw new AppError(409, 'Bàn đang có đơn chưa thanh toán');
        if (input.customerId) await assertActiveCustomer(tx, input.customerId);

        const order = await tx.order.create({
          data: {
            code: await nextCode(tx, 'HD'),
            tableId: table.id,
            staffId: actor.id,
            customerId: input.customerId ?? null,
            note: input.note ?? null,
          },
        });
        await tx.diningTable.update({ where: { id: table.id }, data: { status: TableStatus.SELECTING } });
        return order.id;
      }),
    );
    return getOrder(id, actor);
  } catch (e) {
    // Lưới an toàn: partial unique index một đơn mở mỗi bàn.
    if (isUniqueViolation(e)) throw new AppError(409, 'Bàn đang có đơn chưa thanh toán');
    throw e;
  }
}

export async function updateOrderNote(id: number, note: string | null, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    await lockOpenOrder(tx, id);
    await tx.order.update({ where: { id }, data: { note } });
    return detail(tx, id, actor);
  });
}

export async function addItem(id: number, input: AddItemInput, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOpenOrder(tx, id);
    const line = await resolveLine(tx, input.drinkId, { sizeId: input.sizeId, toppings: input.toppings });
    const note = input.note ?? null;
    const key = toppingKey(line.toppings);
    const same = order.items.find(
      (i) => i.drinkId === line.drinkId && i.sizeId === line.sizeId && i.note === note && toppingKey(i.toppings) === key,
    );
    if (same) {
      // Q11/Q13: cộng dồn, giữ giá đã chốt.
      const quantity = same.quantity + input.quantity;
      if (quantity > MAX_ITEM_QTY) throw new AppError(400, `Số lượng một dòng tối đa ${MAX_ITEM_QTY}`);
      await tx.orderItem.update({ where: { id: same.id }, data: { quantity } });
    } else {
      await tx.orderItem.create({
        data: {
          orderId: id,
          drinkId: line.drinkId,
          sizeId: line.sizeId,
          drinkName: line.drinkName,
          sizeName: line.sizeName,
          quantity: input.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          note,
          toppings: {
            create: line.toppings.map((t) => ({
              toppingId: t.toppingId,
              name: t.name,
              price: t.price,
              unitCost: t.unitCost,
              quantity: t.quantity,
            })),
          },
        },
      });
    }
    await refresh(tx, id, order.tableId);
    return detail(tx, id, actor);
  });
}

export async function updateItem(id: number, itemId: number, input: UpdateItemInput, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOpenOrder(tx, id);
    if (!order.items.some((i) => i.id === itemId)) throw new AppError(404, 'Không tìm thấy món trong đơn');
    if (input.quantity === 0) {
      await tx.orderItem.delete({ where: { id: itemId } });
    } else {
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
    }
    await refresh(tx, id, order.tableId);
    return detail(tx, id, actor);
  });
}

export async function removeItem(id: number, itemId: number, actor: Actor) {
  return updateItem(id, itemId, { quantity: 0 }, actor);
}

export async function setCustomer(id: number, customerId: number | null, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    await lockOpenOrder(tx, id);
    if (customerId) await assertActiveCustomer(tx, customerId);
    await tx.order.update({ where: { id }, data: { customerId } });
    return detail(tx, id, actor);
  });
}

/** Tính thử tiền và kiểm tra tồn kho, không lưu gì. */
export async function previewOrder(id: number, redeem: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: { include: { toppings: true } } } });
    if (!order) throw new AppError(404, 'Không tìm thấy đơn');
    if (order.status !== OrderStatus.OPEN) throw new AppError(409, CLOSED_MESSAGE[order.status]);
    const totals = await computeTotals(tx, order, redeem);

    const needs = await orderConsumption(tx, order.items);
    const ids = needs.map((n) => n.ingredientId);
    const [usable, ingredients] = await Promise.all([
      usableSummary(tx, ids),
      tx.ingredient.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, unit: true } }),
    ]);
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const shortages = needs.flatMap((n) => {
      const required = new Decimal(n.quantity);
      const available = usable.get(n.ingredientId)?.usableQty ?? new Decimal(0);
      if (available.gte(required)) return [];
      const ing = byId.get(n.ingredientId)!;
      return [{ ingredientId: ing.id, name: ing.name, unit: ing.unit, required: required.toNumber(), available: available.toNumber() }];
    });
    return { ...totals, shortages };
  });
}

/**
 * Thanh toán trong một transaction: tính tiền, trừ kho theo công thức (thiếu thì 409 và rollback),
 * trừ điểm đã dùng, cộng điểm, chốt đơn, trả bàn.
 */
export async function payOrder(id: number, input: PayOrderInput, actor: Actor) {
  return withCodeRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const order = await lockOpenOrder(tx, id);
        if (order.items.length === 0) throw new AppError(400, 'Đơn chưa có món nào');
        const t = await computeTotals(tx, order, input.redeemPoints);

        await deductForOrder(tx, id, await orderConsumption(tx, order.items));
        if (t.pointsRedeemed > 0) await redeemPoints(tx, order.customerId!, t.pointsRedeemed, t.afterDiscount, id);
        const pointsEarned = order.customerId ? await earnPoints(tx, order.customerId, t.total, id) : 0;

        await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.PAID,
            paidAt: new Date(),
            paymentMethod: input.paymentMethod,
            subtotal: t.subtotal,
            discountPercent: t.discountPercent,
            discountAmount: t.discountAmount,
            pointsRedeemed: t.pointsRedeemed,
            redeemAmount: t.redeemAmount,
            total: t.total,
            pointsEarned,
          },
        });
        await tx.diningTable.update({ where: { id: order.tableId }, data: { status: TableStatus.AVAILABLE } });
        return detail(tx, id, actor);
      },
      { timeout: 20_000 },
    ),
  );
}

/** Q2: chỉ hủy đơn chưa thanh toán; chưa trừ kho hay điểm nên không cần hoàn tác. */
export async function cancelOrder(id: number, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOpenOrder(tx, id);
    await tx.order.update({ where: { id }, data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() } });
    await tx.diningTable.update({ where: { id: order.tableId }, data: { status: TableStatus.AVAILABLE } });
    return detail(tx, id, actor);
  });
}
