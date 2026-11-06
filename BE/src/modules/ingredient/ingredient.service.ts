import { Prisma } from '../../generated/prisma/client.js';
import { IngredientType } from '../../generated/prisma/enums.js';
import { addHours, endOfDayVN, startOfDayVN } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { expiredLotWhere, fefoOrder, usableSummary } from '../stock/lots.js';
import type {
  CreateIngredientInput,
  CreatePurchaseUnitInput,
  ListIngredientsQuery,
  MovementsQuery,
  PrepRecipeInput,
  UpdateIngredientInput,
  UpdatePurchaseUnitInput,
} from './ingredient.schema.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Ngưỡng "sắp hết hạn" (Q4): nguyên liệu thô 7 ngày, bán thành phẩm 2 giờ. */
export const EXPIRING_HOURS: Record<IngredientType, number> = {
  [IngredientType.RAW]: 7 * 24,
  [IngredientType.PREPARED]: 2,
};

export type LowStockReason = 'LOW' | 'EXPIRING' | 'EXPIRED';
export type LotStatus = 'OK' | 'EXPIRING' | 'EXPIRED';

const include = {
  category: { select: { id: true, name: true, icon: true } },
  // Để FE quy đổi tồn kho sang quy cách (ví dụ 23.400 ml = 1 thùng + 11 hộp + 400 ml).
  purchaseUnits: { where: { isActive: true }, orderBy: { factor: 'desc' }, select: { id: true, name: true, factor: true } },
} satisfies Prisma.IngredientInclude;
type IngredientWithCategory = Prisma.IngredientGetPayload<{ include: typeof include }>;
type Summary = { usableQty: Decimal; nextExpiresAt: Date | null };

const emptySummary: Summary = { usableQty: new Decimal(0), nextExpiresAt: null };

export const toDto = (i: IngredientWithCategory, s: Summary = emptySummary) => ({
  ...i,
  usableQty: s.usableQty,
  nextExpiresAt: s.nextExpiresAt,
});

const prismaCode = (e: unknown) => (e as { code?: string })?.code;
const NAME_TAKEN = 'Tên nguyên liệu đã tồn tại';
const CATEGORY_NOT_FOUND = 'Loại nguyên liệu không tồn tại';

/** Đổi lỗi Prisma khi lưu thành lỗi nghiệp vụ. */
function mapWriteError(e: unknown): never {
  if (prismaCode(e) === 'P2002') throw new AppError(409, NAME_TAKEN);
  if (prismaCode(e) === 'P2003') throw new AppError(400, CATEGORY_NOT_FOUND);
  throw e;
}

async function getOrThrow(id: number) {
  const ingredient = await prisma.ingredient.findUnique({ where: { id }, include });
  if (!ingredient) throw new AppError(404, 'Không tìm thấy nguyên liệu');
  return ingredient;
}

async function withSummary(i: IngredientWithCategory) {
  const s = await usableSummary(prisma, [i.id]);
  return toDto(i, s.get(i.id));
}

const lotStatus = (expiresAt: Date | null, type: IngredientType, now: Date): LotStatus => {
  if (!expiresAt) return 'OK';
  if (expiresAt <= now) return 'EXPIRED';
  return expiresAt <= addHours(now, EXPIRING_HOURS[type]) ? 'EXPIRING' : 'OK';
};

// ---------- CRUD ----------

export async function listIngredients(query: ListIngredientsQuery) {
  const where: Prisma.IngredientWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    ...(query.categoryId !== undefined ? { categoryId: query.categoryId === 'none' ? null : query.categoryId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.ingredient.findMany({
      where,
      include,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.ingredient.count({ where }),
  ]);
  const summary = await usableSummary(prisma, items.map((i) => i.id));
  return { items: items.map((i) => toDto(i, summary.get(i.id))), total, page: query.page, pageSize: query.pageSize };
}

export async function getIngredient(id: number) {
  return withSummary(await getOrThrow(id));
}

export async function createIngredient(input: CreateIngredientInput) {
  try {
    return toDto(await prisma.ingredient.create({ data: input, include }));
  } catch (e) {
    mapWriteError(e);
  }
}

export async function updateIngredient(id: number, input: UpdateIngredientInput) {
  const cur = await getOrThrow(id);
  const type = input.type ?? cur.type;
  const typeChanged = type !== cur.type;

  const unitChanged = input.unit !== undefined && input.unit !== cur.unit;
  if (typeChanged || unitChanged) {
    const lots = await prisma.stockLot.count({ where: { ingredientId: id } });
    if (lots > 0) {
      throw new AppError(409, `Không đổi được ${typeChanged ? 'kiểu' : 'đơn vị'} nguyên liệu khi đã có lô hàng`);
    }
  }
  if (typeChanged) {
    if (type === IngredientType.PREPARED && (await prisma.prepRecipeItem.count({ where: { ingredientId: id } })) > 0) {
      throw new AppError(409, 'Nguyên liệu đang dùng trong định mức sơ chế, không đổi được thành bán thành phẩm');
    }
  }
  const shelfLifeHours = input.shelfLifeHours !== undefined ? input.shelfLifeHours : cur.shelfLifeHours;
  if (type === IngredientType.PREPARED && shelfLifeHours == null) {
    throw new AppError(400, 'Bán thành phẩm bắt buộc có thời hạn sử dụng');
  }
  if (type === IngredientType.RAW && input.batchYield != null) {
    throw new AppError(400, 'Chỉ bán thành phẩm mới có sản lượng mẻ');
  }

  const data: Prisma.IngredientUncheckedUpdateInput = {
    ...input,
    ...(type === IngredientType.RAW ? { batchYield: null } : {}),
  };
  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (typeChanged && type === IngredientType.RAW) await tx.prepRecipeItem.deleteMany({ where: { preparedId: id } });
      return tx.ingredient.update({ where: { id }, data, include });
    });
    return withSummary(updated);
  } catch (e) {
    mapWriteError(e);
  }
}

/** Xóa cứng nếu chưa phát sinh phiếu, lô hoặc định mức; ngược lại chỉ ẩn đi. */
export async function removeIngredient(id: number) {
  await getOrThrow(id);
  const counts = await Promise.all([
    prisma.stockInItem.count({ where: { ingredientId: id } }),
    prisma.stockOutItem.count({ where: { ingredientId: id } }),
    prisma.stockLot.count({ where: { ingredientId: id } }),
    prisma.prepRecipeItem.count({ where: { ingredientId: id } }),
    prisma.prepBatch.count({ where: { preparedId: id } }),
    prisma.stockCountItem.count({ where: { ingredientId: id } }),
    // TODO(Drink): thêm recipe.count({ where: { ingredientId: id } }) khi có bảng Recipe.
  ]);
  if (counts.some((c) => c > 0)) {
    await prisma.ingredient.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.ingredient.delete({ where: { id } });
  }
}

// ---------- Cảnh báo ----------

export async function getLowStock() {
  const now = new Date();
  const ingredients = await prisma.ingredient.findMany({ where: { isActive: true }, include, orderBy: { name: 'asc' } });
  const ids = ingredients.map((i) => i.id);
  const [summary, expired] = await Promise.all([
    usableSummary(prisma, ids, now),
    prisma.stockLot.groupBy({
      by: ['ingredientId'],
      where: { ...expiredLotWhere(now), ingredientId: { in: ids } },
      _sum: { remainingQty: true },
    }),
  ]);
  const expiredQty = new Map(expired.map((e) => [e.ingredientId, e._sum.remainingQty ?? new Decimal(0)]));

  const result: (ReturnType<typeof toDto> & { reasons: LowStockReason[]; expiredQty: Decimal })[] = [];
  for (const i of ingredients) {
    const s = summary.get(i.id) ?? emptySummary;
    const reasons: LowStockReason[] = [];
    if (i.minStock.gt(0) && s.usableQty.lte(i.minStock)) reasons.push('LOW');
    if (expiredQty.has(i.id)) reasons.push('EXPIRED');
    if (lotStatus(s.nextExpiresAt, i.type, now) === 'EXPIRING') reasons.push('EXPIRING');
    if (reasons.length > 0) result.push({ ...toDto(i, s), reasons, expiredQty: expiredQty.get(i.id) ?? new Decimal(0) });
  }
  return result;
}

// ---------- Lô hàng ----------

export async function listLots(id: number) {
  const ingredient = await getOrThrow(id);
  const now = new Date();
  const lots = await prisma.stockLot.findMany({
    where: { ingredientId: id, remainingQty: { gt: 0 } },
    orderBy: fefoOrder,
    include: {
      stockInItem: { select: { stockIn: { select: { id: true, code: true, supplier: { select: { name: true } } } } } },
      prepBatch: { select: { id: true, code: true } },
      countItem: { select: { stockCount: { select: { id: true, code: true } } } },
    },
  });
  return lots.map(({ stockInItem, prepBatch, countItem, ...l }) => ({
    ...l,
    status: lotStatus(l.expiresAt, ingredient.type, now),
    refCode: stockInItem?.stockIn.code ?? prepBatch?.code ?? countItem?.stockCount.code ?? null,
    supplierName: stockInItem?.stockIn.supplier.name ?? null,
  }));
}

// ---------- Thẻ kho ----------

type Movement = {
  kind: 'OPENING' | 'STOCK_IN' | 'PREP_OUTPUT' | 'COUNT_IN' | 'SALE' | 'USAGE' | 'DISCARD' | 'ADJUST' | 'PREP';
  refId: number | null;
  code: string | null;
  at: Date;
  quantity: Decimal;
  unitCost: Decimal;
  note: string | null;
  seq: number;
};

/**
 * Gộp mọi biến động của một nguyên liệu theo thời gian. Tồn sau mỗi dòng tính lũy kế
 * ngược từ tồn hiện tại nên cần đọc toàn bộ lịch sử rồi mới lọc theo khoảng ngày.
 */
export async function getMovements(id: number, query: MovementsQuery) {
  const ingredient = await getOrThrow(id);
  const [openings, ins, outs, preps, counts] = await Promise.all([
    prisma.stockLot.findMany({ where: { ingredientId: id, source: 'OPENING' } }),
    prisma.stockInItem.findMany({ where: { ingredientId: id }, include: { stockIn: { select: { id: true, code: true, createdAt: true, note: true } } } }),
    prisma.stockOutItem.findMany({ where: { ingredientId: id }, include: { stockOut: { select: { id: true, code: true, reason: true, createdAt: true, note: true } } } }),
    prisma.prepBatch.findMany({ where: { preparedId: id }, include: { lot: { select: { unitCost: true } } } }),
    prisma.stockCountItem.findMany({ where: { ingredientId: id, diff: { gt: 0 } }, include: { stockCount: { select: { id: true, code: true, createdAt: true, note: true } } } }),
  ]);

  const rows: Movement[] = [
    ...openings.map((l) => ({ kind: 'OPENING' as const, refId: null, code: null, at: l.createdAt, quantity: l.initialQty, unitCost: l.unitCost, note: 'Tồn đầu kỳ', seq: l.id })),
    ...ins.map((i) => ({ kind: 'STOCK_IN' as const, refId: i.stockIn.id, code: i.stockIn.code, at: i.stockIn.createdAt, quantity: i.quantity, unitCost: i.unitPrice, note: i.stockIn.note, seq: i.id })),
    ...outs.map((o) => ({ kind: o.stockOut.reason, refId: o.stockOut.id, code: o.stockOut.code, at: o.stockOut.createdAt, quantity: o.quantity.neg(), unitCost: o.unitCost, note: o.stockOut.note, seq: o.id })),
    ...preps.map((p) => ({ kind: 'PREP_OUTPUT' as const, refId: p.id, code: p.code, at: p.producedAt, quantity: p.actualQty, unitCost: p.lot?.unitCost ?? new Decimal(0), note: p.note, seq: p.id })),
    ...counts.map((c) => ({ kind: 'COUNT_IN' as const, refId: c.stockCount.id, code: c.stockCount.code, at: c.stockCount.createdAt, quantity: c.diff, unitCost: c.unitCost, note: c.stockCount.note, seq: c.id })),
  ];
  rows.sort((a, b) => b.at.getTime() - a.at.getTime() || b.seq - a.seq);

  let balance = ingredient.quantity;
  const withBalance = rows.map((r) => {
    const row = { ...r, balanceAfter: balance };
    balance = balance.sub(r.quantity);
    return row;
  });

  const from = query.from ? startOfDayVN(query.from) : null;
  const to = query.to ? endOfDayVN(query.to) : null;
  const filtered = withBalance.filter((r) => (!from || r.at >= from) && (!to || r.at <= to));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(start, start + query.pageSize).map(({ seq: _seq, ...r }) => r),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

// ---------- Quy cách mua ----------

const UNIT_TAKEN = 'Tên quy cách đã tồn tại';

async function getUnitOrThrow(ingredientId: number, unitId: number) {
  const unit = await prisma.purchaseUnit.findUnique({ where: { id: unitId } });
  if (!unit || unit.ingredientId !== ingredientId) throw new AppError(404, 'Không tìm thấy quy cách');
  return unit;
}

export async function listPurchaseUnits(id: number) {
  await getOrThrow(id);
  return prisma.purchaseUnit.findMany({ where: { ingredientId: id }, orderBy: [{ isActive: 'desc' }, { factor: 'asc' }] });
}

export async function createPurchaseUnit(id: number, input: CreatePurchaseUnitInput) {
  const ingredient = await getOrThrow(id);
  if (ingredient.type !== IngredientType.RAW) throw new AppError(400, 'Bán thành phẩm không có quy cách mua');
  try {
    return await prisma.purchaseUnit.create({ data: { ...input, ingredientId: id } });
  } catch (e) {
    if (prismaCode(e) === 'P2002') throw new AppError(409, UNIT_TAKEN);
    throw e;
  }
}

export async function updatePurchaseUnit(id: number, unitId: number, input: UpdatePurchaseUnitInput) {
  await getUnitOrThrow(id, unitId);
  try {
    return await prisma.purchaseUnit.update({ where: { id: unitId }, data: input });
  } catch (e) {
    if (prismaCode(e) === 'P2002') throw new AppError(409, UNIT_TAKEN);
    throw e;
  }
}

/** Đã dùng trong phiếu nhập (theo tên đã chụp lại) thì chỉ ẩn. */
export async function removePurchaseUnit(id: number, unitId: number) {
  const unit = await getUnitOrThrow(id, unitId);
  const used = await prisma.stockInItem.count({ where: { ingredientId: id, purchaseUnitName: unit.name } });
  if (used > 0) await prisma.purchaseUnit.update({ where: { id: unitId }, data: { isActive: false } });
  else await prisma.purchaseUnit.delete({ where: { id: unitId } });
}

// ---------- Định mức mẻ ----------

export async function getPrepRecipe(id: number) {
  const ingredient = await getOrThrow(id);
  const items = await prisma.prepRecipeItem.findMany({
    where: { preparedId: id },
    include: { ingredient: { select: { id: true, name: true, unit: true, avgCost: true, isActive: true } } },
    orderBy: { id: 'asc' },
  });
  const batchCost = items.reduce((s, i) => s.add(i.quantity.mul(i.ingredient.avgCost)), new Decimal(0));
  return { batchYield: ingredient.batchYield, items, batchCost: batchCost.toDecimalPlaces(2) };
}

export async function setPrepRecipe(id: number, input: PrepRecipeInput) {
  const ingredient = await getOrThrow(id);
  if (ingredient.type !== IngredientType.PREPARED) throw new AppError(400, 'Chỉ bán thành phẩm mới có định mức mẻ');

  const ids = input.items.map((i) => i.ingredientId);
  if (ids.includes(id)) throw new AppError(400, 'Bán thành phẩm không thể là đầu vào của chính nó');
  const inputs = await prisma.ingredient.findMany({ where: { id: { in: ids } } });
  const found = new Set(inputs.map((i) => i.id));
  const missing = ids.filter((x) => !found.has(x));
  if (missing.length > 0) throw new AppError(400, `Nguyên liệu không tồn tại: ${missing.join(', ')}`);
  // Q11: đầu vào của mẻ sơ chế chỉ là nguyên liệu thô.
  const notRaw = inputs.filter((i) => i.type !== IngredientType.RAW).map((i) => i.name);
  if (notRaw.length > 0) throw new AppError(400, `Đầu vào của mẻ chỉ được là nguyên liệu thô: ${notRaw.join(', ')}`);

  await prisma.$transaction([
    prisma.prepRecipeItem.deleteMany({ where: { preparedId: id } }),
    prisma.prepRecipeItem.createMany({
      data: input.items.map((i) => ({ preparedId: id, ingredientId: i.ingredientId, quantity: i.quantity })),
    }),
    prisma.ingredient.update({ where: { id }, data: { batchYield: input.batchYield } }),
  ]);
  return getPrepRecipe(id);
}
