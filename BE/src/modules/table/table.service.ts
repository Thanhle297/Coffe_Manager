import { OrderStatus, TableStatus } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { CreateTableInput, ListTablesQuery, UpdateTableInput } from './table.schema.js';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const NAME_TAKEN = 'Tên bàn đã tồn tại';
const HAS_OPEN_ORDER = 'Bàn đang có đơn chưa thanh toán';

const openOrderInclude = {
  orders: {
    where: { status: OrderStatus.OPEN },
    select: {
      id: true,
      code: true,
      createdAt: true,
      customer: { select: { id: true, fullName: true } },
      items: { select: { quantity: true, unitPrice: true } },
    },
  },
} as const;

type TableWithOpen = Awaited<ReturnType<typeof findWithOpen>>;
const findWithOpen = (id: number) => prisma.diningTable.findUnique({ where: { id }, include: openOrderInclude });

const tableDto = (t: NonNullable<TableWithOpen>) => {
  const { orders, ...table } = t;
  const o = orders[0];
  return {
    ...table,
    currentOrder: o
      ? {
          id: o.id,
          code: o.code,
          createdAt: o.createdAt,
          customerName: o.customer?.fullName ?? null,
          itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
          subtotal: o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
        }
      : null,
  };
};

async function getOrThrow(id: number) {
  const table = await findWithOpen(id);
  if (!table) throw new AppError(404, 'Không tìm thấy bàn');
  return table;
}

export async function listTables(query: ListTablesQuery) {
  const tables = await prisma.diningTable.findMany({
    where: {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.floor ? { floor: query.floor } : {}),
    },
    orderBy: [{ floor: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: openOrderInclude,
  });
  return tables.map(tableDto);
}

export async function getTable(id: number) {
  return tableDto(await getOrThrow(id));
}

export async function createTable(input: CreateTableInput) {
  try {
    const t = await prisma.diningTable.create({ data: input });
    return getTable(t.id);
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

export async function updateTable(id: number, input: UpdateTableInput) {
  const table = await getOrThrow(id);
  if (input.isActive === false && table.orders.length > 0) throw new AppError(409, HAS_OPEN_ORDER);
  try {
    await prisma.diningTable.update({
      where: { id },
      data: { ...input, ...(input.isActive === false ? { status: TableStatus.AVAILABLE } : {}) },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
  return getTable(id);
}

/** Có đơn mở: chặn. Đã từng có đơn: ẩn. Chưa có đơn nào: xóa hẳn. */
export async function removeTable(id: number) {
  const table = await getOrThrow(id);
  if (table.orders.length > 0) throw new AppError(409, HAS_OPEN_ORDER);
  const used = await prisma.order.count({ where: { tableId: id } });
  if (used > 0) {
    await prisma.diningTable.update({ where: { id }, data: { isActive: false, status: TableStatus.AVAILABLE } });
  } else {
    await prisma.diningTable.delete({ where: { id } });
  }
}

/** Đổi trạng thái tay (khách ngồi trước khi gọi món); không áp dụng khi bàn có đơn mở. */
export async function setTableStatus(id: number, status: TableStatus) {
  const table = await getOrThrow(id);
  if (!table.isActive) throw new AppError(400, 'Bàn đã ngừng sử dụng');
  if (table.orders.length > 0) throw new AppError(409, HAS_OPEN_ORDER);
  await prisma.diningTable.update({ where: { id }, data: { status } });
  return getTable(id);
}
