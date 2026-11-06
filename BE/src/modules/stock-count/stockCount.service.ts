import { Prisma } from '../../generated/prisma/client.js';
import { LotSource, StockOutReason } from '../../generated/prisma/enums.js';
import { addHours } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { nextCode, withCodeRetry } from '../stock/codes.js';
import { createLot, lockIngredients, usableLotWhere } from '../stock/lots.js';
import { applyStockOut, rangeWhere } from '../stock/stock.service.js';
import type { CreateStockCountInput, ListStockCountsQuery } from './stockCount.schema.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const creator = { select: { id: true, fullName: true } } as const;
const detailInclude = {
  createdBy: creator,
  stockOut: { select: { id: true, code: true } },
  items: {
    include: { ingredient: { select: { id: true, name: true, unit: true, category: { select: { icon: true } } } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.StockCountInclude;

type CountFull = Prisma.StockCountGetPayload<{ include: typeof detailInclude }>;

/** Tổng giá trị chênh lệch = Σ diff × unitCost. */
const withTotals = (c: CountFull) => {
  let increase = new Decimal(0);
  let decrease = new Decimal(0);
  for (const i of c.items) {
    const v = i.diff.mul(i.unitCost);
    if (v.gt(0)) increase = increase.add(v);
    else decrease = decrease.add(v);
  }
  return {
    ...c,
    increaseValue: increase.toDecimalPlaces(0),
    decreaseValue: decrease.toDecimalPlaces(0),
    diffValue: increase.add(decrease).toDecimalPlaces(0),
  };
};

/** Q13: lưu là áp dụng ngay. Âm → phiếu ADJUST (trừ cả lô hết hạn), dương → lô COUNT. */
export async function createStockCount(actorId: number, input: CreateStockCountInput) {
  const created = await withCodeRetry(() =>
    prisma.$transaction(async (tx) => {
      const byId = await lockIngredients(tx, input.items.map((i) => i.ingredientId));
      const inactive = [...byId.values()].filter((i) => !i.isActive).map((i) => i.name);
      if (inactive.length > 0) throw new AppError(400, `Nguyên liệu đã ngừng sử dụng: ${inactive.join(', ')}`);

      const code = await nextCode(tx, 'KK');
      const count = await tx.stockCount.create({
        data: {
          code,
          note: input.note || null,
          createdById: actorId,
          items: {
            create: input.items.map((line) => {
              const ing = byId.get(line.ingredientId)!;
              const actualQty = new Decimal(line.actualQty);
              return {
                ingredientId: ing.id,
                systemQty: ing.quantity,
                actualQty,
                diff: actualQty.sub(ing.quantity),
                unitCost: ing.avgCost,
              };
            }),
          },
        },
        include: { items: true },
      });

      const decreases = count.items.filter((i) => i.diff.lt(0));
      if (decreases.length > 0) {
        await applyStockOut(tx, {
          reason: StockOutReason.ADJUST,
          stockCountId: count.id,
          note: `Kiểm kê ${code}`,
          createdById: actorId,
          lines: decreases.map((i) => ({ ingredientId: i.ingredientId, quantity: i.diff.neg() })),
        });
      }

      const now = new Date();
      for (const item of count.items.filter((i) => i.diff.gt(0))) {
        const ing = byId.get(item.ingredientId)!;
        const farthest = await tx.stockLot.findFirst({
          where: { ingredientId: ing.id, ...usableLotWhere(now), expiresAt: { not: null, gt: now } },
          orderBy: { expiresAt: 'desc' },
          select: { expiresAt: true },
        });
        const expiresAt: Date | null =
          farthest?.expiresAt ?? (ing.shelfLifeHours ? addHours(now, ing.shelfLifeHours) : null);
        await createLot(tx, ing, {
          source: LotSource.COUNT,
          countItemId: item.id,
          quantity: item.diff as Decimal,
          unitCost: ing.avgCost,
          expiresAt,
          updateAvgCost: false,
        });
      }

      return tx.stockCount.findUniqueOrThrow({ where: { id: count.id }, include: detailInclude });
    }),
  );
  return withTotals(created);
}

export async function listStockCounts(query: ListStockCountsQuery) {
  const createdAt = rangeWhere(query.from, query.to);
  const where: Prisma.StockCountWhereInput = createdAt ? { createdAt } : {};
  const [items, total] = await Promise.all([
    prisma.stockCount.findMany({
      where,
      include: detailInclude,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockCount.count({ where }),
  ]);
  return {
    items: items.map((c) => {
      const { items: lines, ...rest } = withTotals(c);
      return { ...rest, itemCount: lines.length, diffCount: lines.filter((l) => !l.diff.isZero()).length };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getStockCount(id: number) {
  const count = await prisma.stockCount.findUnique({ where: { id }, include: detailInclude });
  if (!count) throw new AppError(404, 'Không tìm thấy phiếu kiểm kê');
  return withTotals(count);
}
