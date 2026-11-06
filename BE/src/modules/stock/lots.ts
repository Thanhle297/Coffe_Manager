import { Prisma } from '../../generated/prisma/client.js';
import type { Ingredient, LotSource } from '../../generated/prisma/client.js';
import { AppError } from '../../middlewares/errorHandler.js';

type Tx = Prisma.TransactionClient;
const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Điều kiện lô còn dùng được: còn tồn và chưa hết hạn. */
export const usableLotWhere = (now = new Date()): Prisma.StockLotWhereInput => ({
  remainingQty: { gt: 0 },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/** Điều kiện lô đã hết hạn nhưng chưa hủy. */
export const expiredLotWhere = (now = new Date()): Prisma.StockLotWhereInput => ({
  remainingQty: { gt: 0 },
  expiresAt: { lte: now },
});

/** Thứ tự FEFO: hạn gần nhất trước, lô không có hạn sau cùng. */
export const fefoOrder: Prisma.StockLotOrderByWithRelationInput[] = [
  { expiresAt: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
];

/**
 * Khóa các dòng `Ingredient` theo thứ tự id (tránh deadlock) rồi đọc lại.
 * Id không tồn tại thì trả 400.
 */
export async function lockIngredients(tx: Tx, ids: number[]): Promise<Map<number, Ingredient>> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  if (sorted.length === 0) return new Map();
  await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
  const rows = await tx.ingredient.findMany({ where: { id: { in: sorted } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = sorted.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new AppError(400, `Nguyên liệu không tồn tại: ${missing.join(', ')}`);
  return byId;
}

export type Allocation = { lotId: number; quantity: Decimal };

/**
 * Trừ `qty` vào các lô theo FEFO. Bỏ qua lô hết hạn trừ khi `includeExpired`.
 * Có `lotId` thì chỉ trừ lô đó. Trả về phân bổ và lượng còn thiếu (0 nếu đủ).
 * Người gọi phải khóa nguyên liệu trước.
 */
export async function consumeFefo(
  tx: Tx,
  ingredientId: number,
  qty: Decimal,
  opts: { includeExpired: boolean; lotId?: number; now?: Date },
): Promise<{ allocations: Allocation[]; shortage: Decimal }> {
  const now = opts.now ?? new Date();
  const lots = await tx.stockLot.findMany({
    where: {
      ingredientId,
      ...(opts.includeExpired ? { remainingQty: { gt: 0 } } : usableLotWhere(now)),
      ...(opts.lotId ? { id: opts.lotId } : {}),
    },
    orderBy: fefoOrder,
  });

  let rest = qty;
  const allocations: Allocation[] = [];
  for (const lot of lots) {
    if (rest.lte(0)) break;
    const take = Decimal.min(rest, lot.remainingQty);
    await tx.stockLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
    allocations.push({ lotId: lot.id, quantity: take });
    rest = rest.sub(take);
  }
  return { allocations, shortage: rest };
}

/** Giá vốn bình quân gia quyền sau khi nhận thêm `qty` với giá `unitCost`. */
export function weightedAvg(oldQty: Decimal, oldAvg: Decimal, qty: Decimal, unitCost: Decimal): Decimal {
  const newQty = oldQty.add(qty);
  if (oldQty.lte(0) || newQty.lte(0)) return unitCost.toDecimalPlaces(4);
  return oldQty.mul(oldAvg).add(qty.mul(unitCost)).div(newQty).toDecimalPlaces(4);
}

type CreateLotArgs = {
  source: LotSource;
  quantity: Decimal;
  unitCost: Decimal;
  expiresAt: Date | null;
  stockInItemId?: number;
  prepBatchId?: number;
  countItemId?: number;
  /** Mặc định true. Kiểm kê tăng giữ nguyên avgCost. */
  updateAvgCost?: boolean;
};

/**
 * Tạo lô mới và cộng tồn cho nguyên liệu (đã khóa). Cập nhật `ingredient` trong bộ nhớ
 * để người gọi dùng tiếp trong cùng transaction.
 */
export async function createLot(tx: Tx, ingredient: Ingredient, args: CreateLotArgs) {
  const unitCost = args.unitCost.toDecimalPlaces(4);
  const lot = await tx.stockLot.create({
    data: {
      ingredientId: ingredient.id,
      source: args.source,
      stockInItemId: args.stockInItemId ?? null,
      prepBatchId: args.prepBatchId ?? null,
      countItemId: args.countItemId ?? null,
      initialQty: args.quantity,
      remainingQty: args.quantity,
      unitCost,
      expiresAt: args.expiresAt,
    },
  });
  const avgCost =
    args.updateAvgCost === false
      ? ingredient.avgCost
      : weightedAvg(ingredient.quantity, ingredient.avgCost, args.quantity, unitCost);
  const quantity = ingredient.quantity.add(args.quantity);
  await tx.ingredient.update({ where: { id: ingredient.id }, data: { quantity, avgCost } });
  ingredient.quantity = quantity;
  ingredient.avgCost = avgCost;
  return lot;
}

/** Tổng tồn dùng được và hạn gần nhất của các lô dùng được, theo nguyên liệu. */
export async function usableSummary(client: Tx, ingredientIds?: number[], now = new Date()) {
  const rows = await client.stockLot.groupBy({
    by: ['ingredientId'],
    where: { ...usableLotWhere(now), ...(ingredientIds ? { ingredientId: { in: ingredientIds } } : {}) },
    _sum: { remainingQty: true },
    _min: { expiresAt: true },
  });
  return new Map(
    rows.map((r) => [
      r.ingredientId,
      { usableQty: r._sum.remainingQty ?? new Decimal(0), nextExpiresAt: r._min.expiresAt },
    ]),
  );
}
