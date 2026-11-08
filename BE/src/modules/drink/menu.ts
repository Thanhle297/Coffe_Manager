/**
 * Hợp đồng giữa thực đơn và phân hệ Order: kiểm tra lựa chọn của một ly,
 * tính giá bán / giá vốn tại thời điểm bán và nguyên liệu cần trừ kho.
 */
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { StockOutLine } from '../stock/stock.service.js';
import { recipeCost, recipeInclude } from './recipe.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type Tx = Prisma.TransactionClient;

/** Số phần tối đa của một topping trên một ly (Q7). */
export const MAX_TOPPING_PORTIONS = 3;

export type LineSelection = { sizeId: number; toppings: { toppingId: number; quantity: number }[] };

export type ResolvedLine = {
  drinkId: number;
  drinkName: string;
  sizeId: number;
  sizeName: string;
  /** Giá một ly = giá size + Σ giá topping × số phần. */
  unitPrice: number;
  /** Giá vốn một ly = giá vốn size + Σ giá vốn topping × số phần. */
  unitCost: Decimal;
  toppings: { toppingId: number; name: string; price: number; unitCost: Decimal; quantity: number }[];
};

/**
 * Kiểm tra món đang bán, size thuộc món và đang dùng, topping đã gán cho món, đang bán, 1 đến 3 phần.
 * Ném AppError 400 nếu không hợp lệ.
 */
export async function resolveLine(tx: Tx, drinkId: number, sel: LineSelection): Promise<ResolvedLine> {
  const drink = await tx.drink.findUnique({
    where: { id: drinkId },
    include: {
      sizes: { where: { id: sel.sizeId }, include: { recipe: recipeInclude } },
      toppings: {
        where: { toppingId: { in: sel.toppings.map((t) => t.toppingId) } },
        include: { topping: { include: { recipe: recipeInclude } } },
      },
    },
  });
  if (!drink || !drink.isActive) throw new AppError(400, 'Đồ uống không tồn tại hoặc đã bị gỡ');
  if (!drink.isAvailable) throw new AppError(400, `${drink.name} đang tạm ngưng bán`);
  const size = drink.sizes[0];
  if (!size || !size.isActive) throw new AppError(400, `Size không hợp lệ cho món ${drink.name}`);
  if (size.recipe.length === 0) throw new AppError(400, `${drink.name} size ${size.name} chưa có công thức`);

  if (new Set(sel.toppings.map((t) => t.toppingId)).size !== sel.toppings.length) {
    throw new AppError(400, 'Một topping chỉ được chọn một lần trên mỗi ly');
  }
  const assigned = new Map(drink.toppings.map((dt) => [dt.toppingId, dt.topping]));
  let unitPrice = size.price;
  let unitCost = recipeCost(size.recipe);
  const toppings: ResolvedLine['toppings'] = [];
  for (const t of sel.toppings) {
    if (!Number.isInteger(t.quantity) || t.quantity < 1 || t.quantity > MAX_TOPPING_PORTIONS) {
      throw new AppError(400, `Mỗi topping được chọn từ 1 đến ${MAX_TOPPING_PORTIONS} phần`);
    }
    const topping = assigned.get(t.toppingId);
    if (!topping) throw new AppError(400, `Topping #${t.toppingId} không áp dụng cho món ${drink.name}`);
    if (!topping.isActive || !topping.isAvailable) throw new AppError(400, `Topping ${topping.name} đang tạm ngưng bán`);
    if (topping.recipe.length === 0) throw new AppError(400, `Topping ${topping.name} chưa có công thức`);
    const cost = recipeCost(topping.recipe);
    unitPrice += topping.price * t.quantity;
    unitCost = unitCost.add(cost.mul(t.quantity));
    toppings.push({ toppingId: topping.id, name: topping.name, price: topping.price, unitCost: cost, quantity: t.quantity });
  }

  return { drinkId: drink.id, drinkName: drink.name, sizeId: size.id, sizeName: size.name, unitPrice, unitCost, toppings };
}

/** Nguyên liệu cần trừ cho `qty` ly, đã gộp theo nguyên liệu; đưa thẳng vào `deductForOrder`. */
export async function consumptionOf(tx: Tx, sel: LineSelection, qty: number): Promise<StockOutLine[]> {
  const [sizeRecipe, toppingRecipes] = await Promise.all([
    tx.drinkRecipeItem.findMany({ where: { sizeId: sel.sizeId } }),
    tx.toppingRecipeItem.findMany({ where: { toppingId: { in: sel.toppings.map((t) => t.toppingId) } } }),
  ]);
  const portions = new Map(sel.toppings.map((t) => [t.toppingId, t.quantity]));
  const total = new Map<number, Decimal>();
  const add = (ingredientId: number, q: Decimal) =>
    total.set(ingredientId, (total.get(ingredientId) ?? new Decimal(0)).add(q));

  for (const r of sizeRecipe) add(r.ingredientId, r.quantity.mul(qty));
  for (const r of toppingRecipes) add(r.ingredientId, r.quantity.mul(portions.get(r.toppingId)!).mul(qty));

  return [...total].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
}

/** Gộp nguyên liệu của nhiều dòng đơn thành một danh sách trừ kho. */
export function mergeConsumption(lines: StockOutLine[][]): StockOutLine[] {
  const total = new Map<number, Decimal>();
  for (const l of lines.flat()) {
    total.set(l.ingredientId, (total.get(l.ingredientId) ?? new Decimal(0)).add(new Decimal(l.quantity)));
  }
  return [...total].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
}
