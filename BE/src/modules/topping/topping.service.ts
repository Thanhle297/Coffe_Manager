import type { Prisma } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import {
  assertRecipeIngredients,
  costFields,
  hasShortage,
  isUniqueViolation,
  recipeCost,
  recipeDto,
  recipeInclude,
  recipeLines,
  usableOf,
} from '../drink/recipe.js';
import type { CreateToppingInput, ListToppingsQuery, UpdateToppingInput } from './topping.schema.js';

const NAME_TAKEN = 'Tên topping đã tồn tại';

const include = {
  recipe: recipeInclude,
  _count: { select: { drinks: { where: { drink: { isActive: true } } } } },
} satisfies Prisma.ToppingInclude;
type ToppingRow = Prisma.ToppingGetPayload<{ include: typeof include }>;

async function toDtos(rows: ToppingRow[], role: Role) {
  const usable = await usableOf(prisma, rows.map((t) => t.recipe));
  return rows.map(({ _count, recipe, ...t }) => ({
    ...t,
    drinkCount: _count.drinks,
    recipe: recipeDto(recipe, role),
    shortage: hasShortage(recipe, usable),
    hasInactiveIngredient: recipe.some((r) => !r.ingredient.isActive),
    ...costFields(t.price, recipeCost(recipe), role),
  }));
}

async function getOrThrow(id: number) {
  const topping = await prisma.topping.findUnique({ where: { id }, include });
  if (!topping) throw new AppError(404, 'Không tìm thấy topping');
  return topping;
}

export async function listToppings(query: ListToppingsQuery, role: Role) {
  const rows = await prisma.topping.findMany({
    where: {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    },
    include,
    orderBy: { name: 'asc' },
  });
  return toDtos(rows, role);
}

export async function getTopping(id: number, role: Role) {
  const topping = await getOrThrow(id);
  const drinks = await prisma.drinkTopping.findMany({
    where: { toppingId: id, drink: { isActive: true } },
    select: { drink: { select: { id: true, name: true, categoryId: true } } },
    orderBy: { drink: { name: 'asc' } },
  });
  const [dto] = await toDtos([topping], role);
  return { ...dto, drinks: drinks.map((d) => d.drink) };
}

export async function createTopping(input: CreateToppingInput, role: Role) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      await assertRecipeIngredients(tx, [{ label: input.name, items: input.recipe }]);
      return tx.topping.create({
        data: { name: input.name, price: input.price, recipe: { create: recipeLines(input.recipe) } },
        select: { id: true },
      });
    });
    return getTopping(created.id, role);
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

export async function updateTopping(id: number, input: UpdateToppingInput, role: Role) {
  const cur = await getOrThrow(id);
  try {
    await prisma.$transaction(async (tx) => {
      if (input.recipe) {
        await assertRecipeIngredients(tx, [{ label: input.name ?? cur.name, items: input.recipe }]);
        await tx.toppingRecipeItem.deleteMany({ where: { toppingId: id } });
        await tx.toppingRecipeItem.createMany({ data: recipeLines(input.recipe).map((l) => ({ ...l, toppingId: id })) });
      }
      await tx.topping.update({ where: { id }, data: { name: input.name, price: input.price } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
  return getTopping(id, role);
}

/** Thay toàn bộ danh sách món được chọn topping này. */
export async function setToppingDrinks(id: number, drinkIds: number[], role: Role) {
  await getOrThrow(id);
  await prisma.$transaction(async (tx) => {
    const found = await tx.drink.findMany({ where: { id: { in: drinkIds }, isActive: true }, select: { id: true } });
    if (found.length !== drinkIds.length) {
      const ok = new Set(found.map((d) => d.id));
      throw new AppError(400, `Món không tồn tại hoặc đã gỡ: ${drinkIds.filter((d) => !ok.has(d)).join(', ')}`);
    }
    await tx.drinkTopping.deleteMany({ where: { toppingId: id } });
    await tx.drinkTopping.createMany({ data: drinkIds.map((drinkId) => ({ drinkId, toppingId: id })) });
  });
  return getTopping(id, role);
}

/** Topping chỉ bật bán được khi đang dùng và có công thức (Q3). */
export async function setToppingAvailability(id: number, isAvailable: boolean, role: Role) {
  const cur = await getOrThrow(id);
  if (isAvailable) {
    if (!cur.isActive) throw new AppError(400, 'Topping đã bị gỡ, không bật bán được');
    if (cur.recipe.length === 0) throw new AppError(400, 'Topping chưa có công thức, không bật bán được');
  }
  await prisma.topping.update({ where: { id }, data: { isAvailable } });
  return getTopping(id, role);
}

/**
 * Xóa topping. Đã có trong hóa đơn thì chỉ gỡ (isActive=false, isAvailable=false).
 * TODO(Order): đếm OrderItemTopping để chọn xóa mềm; hiện chưa có hóa đơn nên luôn xóa cứng.
 */
export async function removeTopping(id: number) {
  await getOrThrow(id);
  await prisma.topping.delete({ where: { id } });
}
