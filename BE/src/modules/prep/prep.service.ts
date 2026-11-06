import { Prisma } from '../../generated/prisma/client.js';
import { IngredientType, LotSource, StockOutReason } from '../../generated/prisma/enums.js';
import { addHours } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { nextCode, withCodeRetry } from '../stock/codes.js';
import { createLot, lockIngredients } from '../stock/lots.js';
import { applyStockOut, rangeWhere, stockOutInclude } from '../stock/stock.service.js';
import type { CreatePrepBatchInput, ListPrepBatchesQuery } from './prep.schema.js';

const Decimal = Prisma.Decimal;

const creator = { select: { id: true, fullName: true } } as const;
const listInclude = {
  prepared: { select: { id: true, name: true, unit: true, category: { select: { icon: true } } } },
  createdBy: creator,
  lot: { select: { id: true, unitCost: true, remainingQty: true } },
} satisfies Prisma.PrepBatchInclude;
const detailInclude = { ...listInclude, stockOut: { include: stockOutInclude } } satisfies Prisma.PrepBatchInclude;

/** Lập phiếu sơ chế: trừ nguyên liệu thô theo định mức × số mẻ, tạo lô bán thành phẩm. */
export async function createPrepBatch(actorId: number, input: CreatePrepBatchInput) {
  return withCodeRetry(() =>
    prisma.$transaction(async (tx) => {
      const prepared = await tx.ingredient.findUnique({
        where: { id: input.preparedId },
        include: { prepItems: { orderBy: { id: 'asc' } } },
      });
      if (!prepared || prepared.type !== IngredientType.PREPARED)
        throw new AppError(400, 'Bán thành phẩm không tồn tại');
      if (!prepared.isActive) throw new AppError(400, `Bán thành phẩm đã ngừng sử dụng: ${prepared.name}`);
      if (!prepared.batchYield || !prepared.shelfLifeHours || prepared.prepItems.length === 0)
        throw new AppError(400, `Chưa khai báo định mức mẻ, sản lượng hoặc thời hạn cho ${prepared.name}`);

      const locked = await lockIngredients(tx, [prepared.id, ...prepared.prepItems.map((i) => i.ingredientId)]);
      const output = locked.get(prepared.id)!;

      const batches = new Decimal(input.batches);
      const lines = prepared.prepItems.map((i) => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity.mul(batches).toDecimalPlaces(3),
      }));
      const expectedQty = prepared.batchYield.mul(batches).toDecimalPlaces(3);
      const actualQty = input.actualQty !== undefined ? new Decimal(input.actualQty) : expectedQty;
      if (actualQty.lte(0)) throw new AppError(400, 'Sản lượng thực tế phải lớn hơn 0');
      const totalCost = lines
        .reduce((s, l) => s.add(l.quantity.mul(locked.get(l.ingredientId)!.avgCost)), new Decimal(0))
        .toDecimalPlaces(2);

      const producedAt = new Date();
      const code = await nextCode(tx, 'SC');
      const batch = await tx.prepBatch.create({
        data: {
          code,
          preparedId: prepared.id,
          batches,
          expectedQty,
          actualQty,
          totalCost,
          producedAt,
          expiresAt: addHours(producedAt, prepared.shelfLifeHours),
          note: input.note || null,
          createdById: actorId,
        },
      });

      await applyStockOut(tx, {
        reason: StockOutReason.PREP,
        prepBatchId: batch.id,
        note: `Sơ chế ${code}`,
        createdById: actorId,
        lines,
      });

      // Q12: chênh lệch sản lượng dồn vào giá vốn của mẻ.
      await createLot(tx, output, {
        source: LotSource.PREP,
        prepBatchId: batch.id,
        quantity: actualQty,
        unitCost: totalCost.div(actualQty),
        expiresAt: batch.expiresAt,
      });

      return tx.prepBatch.findUniqueOrThrow({ where: { id: batch.id }, include: detailInclude });
    }),
  );
}

export async function listPrepBatches(query: ListPrepBatchesQuery) {
  const producedAt = rangeWhere(query.from, query.to);
  const where: Prisma.PrepBatchWhereInput = {
    ...(query.preparedId ? { preparedId: query.preparedId } : {}),
    ...(producedAt ? { producedAt } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.prepBatch.findMany({
      where,
      include: listInclude,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.prepBatch.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getPrepBatch(id: number) {
  const batch = await prisma.prepBatch.findUnique({ where: { id }, include: detailInclude });
  if (!batch) throw new AppError(404, 'Không tìm thấy phiếu sơ chế');
  return batch;
}
