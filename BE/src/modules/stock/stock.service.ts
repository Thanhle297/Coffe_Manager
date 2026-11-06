import { Prisma } from '../../generated/prisma/client.js';
import { IngredientType, LotSource, Role, StockOutReason } from '../../generated/prisma/enums.js';
import { addHours, endOfDayVN, expiryFromDate, startOfDayVN, toYmd, todayVN } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { nextCode, withCodeRetry } from './codes.js';
import { consumeFefo, createLot, expiredLotWhere, lockIngredients, type Allocation } from './lots.js';
import type {
  CreateStockInInput,
  CreateStockOutInput,
  DiscardExpiredInput,
  ListStockInQuery,
  ListStockOutQuery,
} from './stock.schema.js';

export { withCodeRetry } from './codes.js';

type Tx = Prisma.TransactionClient;
const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const MAX_INT = 2_000_000_000;
const creator = { select: { id: true, fullName: true } } as const;
const ingredientBrief = {
  select: { id: true, name: true, unit: true, type: true, category: { select: { icon: true } } },
} as const;

export const rangeWhere = (from?: string, to?: string) =>
  from || to
    ? { ...(from ? { gte: startOfDayVN(from) } : {}), ...(to ? { lte: endOfDayVN(to) } : {}) }
    : undefined;

// ---------- Phiếu nhập ----------

const stockInInclude = {
  supplier: { select: { id: true, name: true } },
  createdBy: creator,
  items: { include: { ingredient: ingredientBrief, lot: { select: { id: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.StockInInclude;

type StockInFull = Prisma.StockInGetPayload<{ include: typeof stockInInclude }>;

const stockInDto = ({ importDate, items, ...s }: StockInFull) => ({
  ...s,
  importDate: toYmd(importDate),
  items: items.map(({ lot, ...i }) => ({ ...i, lotId: lot?.id ?? null })),
});

export async function createStockIn(actorId: number, input: CreateStockInInput) {
  const today = todayVN();
  for (const line of input.items) {
    if (line.expiryDate && line.expiryDate < today) throw new AppError(400, 'Hạn sử dụng không được trước hôm nay');
  }

  const created = await withCodeRetry(() =>
    prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || !supplier.isActive) throw new AppError(400, 'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động');

      const byId = await lockIngredients(tx, input.items.map((i) => i.ingredientId));
      const all = [...byId.values()];
      const inactive = all.filter((r) => !r.isActive).map((r) => r.name);
      if (inactive.length > 0) throw new AppError(400, `Nguyên liệu đã ngừng sử dụng: ${inactive.join(', ')}`);
      const prepared = all.filter((r) => r.type !== IngredientType.RAW).map((r) => r.name);
      if (prepared.length > 0)
        throw new AppError(400, `Bán thành phẩm không nhập từ nhà cung cấp mà lập phiếu sơ chế: ${prepared.join(', ')}`);

      const unitIds = input.items.flatMap((i) => (i.purchaseUnitId ? [i.purchaseUnitId] : []));
      const units = new Map(
        (await tx.purchaseUnit.findMany({ where: { id: { in: unitIds } } })).map((u) => [u.id, u] as const),
      );

      const now = new Date();
      let total = new Decimal(0);
      const lines = input.items.map((line) => {
        const ing = byId.get(line.ingredientId)!;
        const expiresAt = line.expiryDate
          ? expiryFromDate(line.expiryDate)
          : ing.shelfLifeHours
            ? addHours(now, ing.shelfLifeHours)
            : null;

        if (line.purchaseUnitId) {
          const unit = units.get(line.purchaseUnitId);
          if (!unit || unit.ingredientId !== ing.id || !unit.isActive)
            throw new AppError(400, `Quy cách không hợp lệ cho nguyên liệu ${ing.name}`);
          const packQty = new Decimal(line.packQty!);
          const packPrice = new Decimal(line.packPrice!);
          total = total.add(packQty.mul(packPrice).toDecimalPlaces(0));
          return {
            ingredientId: ing.id,
            quantity: packQty.mul(unit.factor).toDecimalPlaces(3),
            unitPrice: packPrice.div(unit.factor).toDecimalPlaces(4),
            purchaseUnitName: unit.name,
            packFactor: unit.factor,
            packQty,
            packPrice,
            expiresAt,
          };
        }
        const quantity = new Decimal(line.quantity!);
        const unitPrice = new Decimal(line.unitPrice!);
        total = total.add(quantity.mul(unitPrice).toDecimalPlaces(0));
        return { ingredientId: ing.id, quantity, unitPrice, expiresAt };
      });
      if (total.gt(MAX_INT)) throw new AppError(400, 'Tổng tiền phiếu nhập quá lớn');

      const stockIn = await tx.stockIn.create({
        data: {
          code: await nextCode(tx, 'PN'),
          supplierId: input.supplierId,
          importDate: input.importDate,
          note: input.note || null,
          total: total.toNumber(),
          createdById: actorId,
          items: { create: lines },
        },
        include: { items: true },
      });

      for (const item of [...stockIn.items].sort((a, b) => a.ingredientId - b.ingredientId)) {
        await createLot(tx, byId.get(item.ingredientId)!, {
          source: LotSource.STOCK_IN,
          stockInItemId: item.id,
          quantity: item.quantity,
          unitCost: item.unitPrice,
          expiresAt: item.expiresAt,
        });
      }

      return tx.stockIn.findUniqueOrThrow({ where: { id: stockIn.id }, include: stockInInclude });
    }),
  );
  return stockInDto(created);
}

export async function listStockIns(query: ListStockInQuery) {
  const where: Prisma.StockInWhereInput = {
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.from || query.to
      ? {
          importDate: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.stockIn.findMany({
      where,
      include: { supplier: { select: { id: true, name: true } }, createdBy: creator },
      orderBy: [{ importDate: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockIn.count({ where }),
  ]);
  return {
    items: items.map(({ importDate: d, ...s }) => ({ ...s, importDate: toYmd(d) })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getStockIn(id: number) {
  const stockIn = await prisma.stockIn.findUnique({ where: { id }, include: stockInInclude });
  if (!stockIn) throw new AppError(404, 'Không tìm thấy phiếu nhập');
  return stockInDto(stockIn);
}

// ---------- Phiếu xuất ----------

export const stockOutInclude = {
  createdBy: creator,
  prepBatch: { select: { id: true, code: true } },
  stockCount: { select: { id: true, code: true } },
  items: {
    include: {
      ingredient: ingredientBrief,
      allocations: {
        include: { lot: { select: { id: true, source: true, expiresAt: true, createdAt: true } } },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.StockOutInclude;

export type StockOutLine = { ingredientId: number; quantity: number | string | Decimal; lotId?: number };

type ApplyStockOutArgs = {
  reason: StockOutReason;
  orderId?: number | null;
  prepBatchId?: number | null;
  stockCountId?: number | null;
  note?: string | null;
  createdById: number | null;
  lines: StockOutLine[];
  /** Mặc định chỉ SALE được trừ nguyên liệu đã ẩn (công thức cũ có thể còn dùng). */
  allowInactive?: boolean;
};

/**
 * Lõi trừ kho dùng chung cho mọi phiếu xuất. Chạy trong transaction của người gọi.
 * Trừ theo FEFO; SALE/USAGE/PREP bỏ qua lô hết hạn (Q9), DISCARD/ADJUST thì không.
 * Thiếu tồn thì ném 409 liệt kê đủ tên nguyên liệu (Q10).
 */
export async function applyStockOut(tx: Tx, args: ApplyStockOutArgs) {
  // Gộp theo nguyên liệu; dòng chỉ định lô được trừ trước dòng FEFO.
  const grouped = new Map<number, { lotId?: number; quantity: Decimal }[]>();
  for (const l of args.lines) {
    const parts = grouped.get(l.ingredientId) ?? [];
    parts.push({ lotId: l.lotId, quantity: new Decimal(l.quantity) });
    grouped.set(l.ingredientId, parts);
  }
  const ids = [...grouped.keys()].sort((a, b) => a - b);
  const byId = await lockIngredients(tx, ids);

  const allowInactive = args.allowInactive ?? args.reason === StockOutReason.SALE;
  if (!allowInactive) {
    const inactive = ids.map((id) => byId.get(id)!).filter((i) => !i.isActive).map((i) => i.name);
    if (inactive.length > 0) throw new AppError(400, `Nguyên liệu đã ngừng sử dụng: ${inactive.join(', ')}`);
  }

  const lotIds = args.lines.flatMap((l) => (l.lotId ? [l.lotId] : []));
  if (lotIds.length > 0) {
    const lots = await tx.stockLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, ingredientId: true } });
    const lotOwner = new Map(lots.map((l) => [l.id, l.ingredientId]));
    const bad = args.lines.filter((l) => l.lotId && lotOwner.get(l.lotId) !== l.ingredientId);
    if (bad.length > 0) throw new AppError(400, `Lô không hợp lệ: ${bad.map((l) => l.lotId).join(', ')}`);
  }

  const includeExpired = args.reason === StockOutReason.DISCARD || args.reason === StockOutReason.ADJUST;
  const now = new Date();
  const short: string[] = [];
  const result = new Map<number, { quantity: Decimal; allocations: Map<number, Decimal> }>();

  for (const id of ids) {
    const parts = [...grouped.get(id)!].sort((a, b) => (a.lotId ? 0 : 1) - (b.lotId ? 0 : 1));
    let quantity = new Decimal(0);
    let shortage = new Decimal(0);
    const allocations = new Map<number, Decimal>();
    for (const part of parts) {
      quantity = quantity.add(part.quantity);
      const r = await consumeFefo(tx, id, part.quantity, { includeExpired, lotId: part.lotId, now });
      shortage = shortage.add(r.shortage);
      for (const a of r.allocations as Allocation[]) {
        allocations.set(a.lotId, (allocations.get(a.lotId) ?? new Decimal(0)).add(a.quantity));
      }
    }
    if (shortage.gt(0)) short.push(byId.get(id)!.name);
    result.set(id, { quantity, allocations });
  }
  if (short.length > 0) throw new AppError(409, `Không đủ tồn kho: ${short.join(', ')}`);

  const stockOut = await tx.stockOut.create({
    data: {
      code: await nextCode(tx, 'PX'),
      reason: args.reason,
      orderId: args.orderId ?? null,
      prepBatchId: args.prepBatchId ?? null,
      stockCountId: args.stockCountId ?? null,
      note: args.note || null,
      createdById: args.createdById,
    },
    select: { id: true },
  });

  for (const id of ids) {
    const { quantity, allocations } = result.get(id)!;
    const ing = byId.get(id)!;
    await tx.stockOutItem.create({
      data: {
        stockOutId: stockOut.id,
        ingredientId: id,
        quantity,
        unitCost: ing.avgCost,
        allocations: { create: [...allocations].map(([lotId, q]) => ({ lotId, quantity: q })) },
      },
    });
    ing.quantity = ing.quantity.sub(quantity);
    await tx.ingredient.update({ where: { id }, data: { quantity: ing.quantity } });
  }

  return tx.stockOut.findUniqueOrThrow({ where: { id: stockOut.id }, include: stockOutInclude });
}

export async function createStockOut(actor: { id: number; role: Role }, input: CreateStockOutInput) {
  // Q5: Nhân viên chỉ được lập phiếu Sử dụng hoặc Hủy.
  if (actor.role !== Role.MANAGER && input.reason === StockOutReason.ADJUST) {
    throw new AppError(403, 'Bạn không có quyền thực hiện thao tác này');
  }
  return withCodeRetry(() =>
    prisma.$transaction((tx) =>
      applyStockOut(tx, {
        reason: input.reason,
        note: input.note,
        createdById: actor.id,
        lines: input.items,
      }),
    ),
  );
}

/**
 * Trừ kho khi thanh toán đơn (reason = SALE). Phân hệ Order gọi trong transaction thanh toán.
 * Bỏ qua lô hết hạn; thiếu tồn thì ném 409 và chặn thanh toán. Order tự bọc `withCodeRetry`.
 */
export function deductForOrder(tx: Tx, orderId: number, lines: StockOutLine[]) {
  return applyStockOut(tx, { reason: StockOutReason.SALE, orderId, createdById: null, lines });
}

/** Lập một phiếu DISCARD cho mọi lô đã hết hạn còn tồn (lọc theo `ingredientIds` nếu có). */
export async function discardExpired(actorId: number, input: DiscardExpiredInput) {
  return withCodeRetry(() =>
    prisma.$transaction(async (tx) => {
      const now = new Date();
      const filter = input.ingredientIds?.length ? { ingredientId: { in: input.ingredientIds } } : {};
      const candidates = await tx.stockLot.findMany({
        where: { ...expiredLotWhere(now), ...filter },
        select: { ingredientId: true },
        distinct: ['ingredientId'],
      });
      if (candidates.length === 0) return { stockOut: null };

      await lockIngredients(tx, candidates.map((c) => c.ingredientId));
      // Đọc lại sau khi khóa để tránh trừ trùng với thao tác song song.
      const lots = await tx.stockLot.findMany({ where: { ...expiredLotWhere(now), ...filter }, orderBy: { id: 'asc' } });
      if (lots.length === 0) return { stockOut: null };

      const stockOut = await applyStockOut(tx, {
        reason: StockOutReason.DISCARD,
        note: 'Hủy lô hết hạn',
        createdById: actorId,
        allowInactive: true,
        lines: lots.map((l) => ({ ingredientId: l.ingredientId, quantity: l.remainingQty, lotId: l.id })),
      });
      return { stockOut };
    }),
  );
}

export async function listStockOuts(query: ListStockOutQuery) {
  const createdAt = rangeWhere(query.from, query.to);
  const where: Prisma.StockOutWhereInput = {
    ...(query.reason ? { reason: query.reason } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.stockOut.findMany({
      where,
      include: {
        createdBy: creator,
        prepBatch: { select: { id: true, code: true } },
        stockCount: { select: { id: true, code: true } },
      },
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockOut.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getStockOut(id: number) {
  const stockOut = await prisma.stockOut.findUnique({ where: { id }, include: stockOutInclude });
  if (!stockOut) throw new AppError(404, 'Không tìm thấy phiếu xuất');
  return stockOut;
}
