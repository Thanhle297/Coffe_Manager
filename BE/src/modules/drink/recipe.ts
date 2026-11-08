import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';
import { positiveQuantity } from '../../lib/zodHelpers.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { usableSummary } from '../stock/lots.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Tx = Prisma.TransactionClient;

/** Công thức (size hoặc topping): 1 đến `max` dòng, không trùng nguyên liệu, lượng > 0. */
export const recipeSchema = (max: number) =>
  z
    .array(
      z.object({
        ingredientId: z.number({ error: 'Nguyên liệu không hợp lệ' }).int().positive('Nguyên liệu không hợp lệ'),
        quantity: positiveQuantity('Định lượng'),
      }),
      { error: 'Công thức không hợp lệ' },
    )
    .min(1, 'Công thức phải có ít nhất một nguyên liệu')
    .max(max, `Công thức tối đa ${max} dòng`)
    .refine((items) => new Set(items.map((i) => i.ingredientId)).size === items.length, {
      message: 'Một nguyên liệu chỉ được xuất hiện một lần trong công thức',
    });

export type RecipeInput = z.infer<ReturnType<typeof recipeSchema>>;

export const recipeInclude = {
  include: { ingredient: { select: { id: true, name: true, unit: true, avgCost: true, isActive: true } } },
  orderBy: { ingredientId: 'asc' },
} as const;

type RecipeRow = {
  ingredientId: number;
  quantity: Decimal;
  ingredient: { id: number; name: string; unit: string; avgCost: Decimal; isActive: boolean };
};

/** Kiểm tra mọi nguyên liệu trong các công thức tồn tại và đang dùng; lỗi kèm nhãn (tên size/topping). */
export async function assertRecipeIngredients(client: Tx, recipes: { label: string; items: RecipeInput }[]) {
  const ids = [...new Set(recipes.flatMap((r) => r.items.map((i) => i.ingredientId)))];
  if (ids.length === 0) return;
  const found = await client.ingredient.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isActive: true } });
  const byId = new Map(found.map((i) => [i.id, i]));
  for (const r of recipes) {
    const bad = r.items.map((i) => byId.get(i.ingredientId)).filter((i) => !i?.isActive);
    if (bad.length === 0) continue;
    const missing = r.items.filter((i) => !byId.has(i.ingredientId)).map((i) => `#${i.ingredientId}`);
    const inactive = bad.filter((i) => i).map((i) => i!.name);
    throw new AppError(
      400,
      `${r.label}: nguyên liệu không tồn tại hoặc đã ngừng dùng: ${[...inactive, ...missing].join(', ')}`,
    );
  }
}

/** Giá vốn hiện tại của một công thức = Σ lượng × avgCost. */
export const recipeCost = (rows: RecipeRow[]): Decimal =>
  rows.reduce((s, r) => s.add(r.quantity.mul(r.ingredient.avgCost)), new Decimal(0));

/** Lượng tồn dùng được (bỏ lô hết hạn) của các nguyên liệu xuất hiện trong công thức. */
export async function usableOf(client: Tx, recipes: RecipeRow[][]) {
  const ids = [...new Set(recipes.flatMap((r) => r.map((i) => i.ingredientId)))];
  const summary = await usableSummary(client, ids);
  return new Map(ids.map((id) => [id, summary.get(id)?.usableQty ?? new Decimal(0)]));
}

/** Thiếu nguyên liệu khi tồn dùng được < lượng cần cho một ly / một phần. */
export const hasShortage = (rows: RecipeRow[], usable: Map<number, Decimal>) =>
  rows.some((r) => (usable.get(r.ingredientId) ?? new Decimal(0)).lt(r.quantity));

/** Dòng công thức trả ra API; chỉ Quản lý thấy giá vốn (Q5). */
export const recipeDto = (rows: RecipeRow[], role: Role) =>
  rows.map((r) => ({
    ingredientId: r.ingredientId,
    name: r.ingredient.name,
    unit: r.ingredient.unit,
    quantity: r.quantity,
    isActive: r.ingredient.isActive,
    ...(role === Role.MANAGER ? { cost: money(r.quantity.mul(r.ingredient.avgCost)) } : {}),
  }));

/** Làm tròn tiền về 2 chữ số để trả ra API. */
export const money = (d: Decimal) => d.toDecimalPlaces(2).toNumber();

/** Giá vốn và biên lợi nhuận (chỉ Quản lý). */
export const costFields = (price: number, cost: Decimal, role: Role) =>
  role === Role.MANAGER
    ? {
        cost: money(cost),
        margin: money(new Decimal(price).sub(cost)),
        marginPercent: price > 0 ? new Decimal(price).sub(cost).div(price).mul(100).toDecimalPlaces(1).toNumber() : null,
      }
    : {};

export const recipeLines = (items: RecipeInput) => items.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity }));

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
export const isFkViolation = (e: unknown) => (e as { code?: string })?.code === 'P2003';
