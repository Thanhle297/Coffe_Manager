import { Prisma } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { publicUrl, removeUploaded } from '../../middlewares/upload.js';
import {
  assertRecipeIngredients,
  costFields,
  hasShortage,
  isFkViolation,
  isUniqueViolation,
  recipeCost,
  recipeDto,
  recipeInclude,
  recipeLines,
  usableOf,
} from './recipe.js';
import type { CreateDrinkInput, ListDrinksQuery, SizeInput, UpdateDrinkInput } from './drink.schema.js';

type Tx = Prisma.TransactionClient;

const NAME_TAKEN = 'Tên đồ uống đã tồn tại';
const CATEGORY_NOT_FOUND = 'Danh mục không tồn tại';
export const IMAGE_FOLDER = 'drinks';

function mapWriteError(e: unknown): never {
  if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
  if (isFkViolation(e)) throw new AppError(400, CATEGORY_NOT_FOUND);
  throw e;
}

const activeSizes = {
  where: { isActive: true },
  orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }, { id: 'asc' }],
  include: { recipe: recipeInclude },
} satisfies Prisma.Drink$sizesArgs;

const include = {
  category: { select: { id: true, name: true } },
  sizes: activeSizes,
} satisfies Prisma.DrinkInclude;
type DrinkRow = Prisma.DrinkGetPayload<{ include: typeof include }>;
type SizeRow = DrinkRow['sizes'][number];

/** Món bán được khi đang dùng, có size đang dùng và mọi size đều có công thức (Q3). */
const missingRecipe = (sizes: { recipe: unknown[] }[]) => sizes.length === 0 || sizes.some((s) => s.recipe.length === 0);

const sizeDto = (s: SizeRow, role: Role, usable: Map<number, Prisma.Decimal>, withRecipe: boolean) => ({
  id: s.id,
  name: s.name,
  price: s.price,
  sortOrder: s.sortOrder,
  isDefault: s.isDefault,
  shortage: hasShortage(s.recipe, usable),
  ...costFields(s.price, recipeCost(s.recipe), role),
  ...(withRecipe ? { recipe: recipeDto(s.recipe, role) } : {}),
});

function drinkDto(d: DrinkRow, role: Role, usable: Map<number, Prisma.Decimal>, withRecipe = false) {
  const sizes = d.sizes.map((s) => sizeDto(s, role, usable, withRecipe));
  const prices = sizes.map((s) => s.price);
  const { sizes: _sizes, ...rest } = d;
  return {
    ...rest,
    sizes,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    missingRecipe: missingRecipe(d.sizes),
    shortage: sizes.some((s) => s.shortage),
    hasInactiveIngredient: d.sizes.some((s) => s.recipe.some((r) => !r.ingredient.isActive)),
  };
}

async function getOrThrow(id: number, client: Tx = prisma) {
  const drink = await client.drink.findUnique({ where: { id }, include });
  if (!drink) throw new AppError(404, 'Không tìm thấy đồ uống');
  return drink;
}

/** Topping được gán phải tồn tại và chưa bị gỡ. */
async function assertToppings(tx: Tx, toppingIds: number[]) {
  if (toppingIds.length === 0) return;
  const found = await tx.topping.findMany({ where: { id: { in: toppingIds }, isActive: true }, select: { id: true } });
  if (found.length !== toppingIds.length) {
    const ok = new Set(found.map((t) => t.id));
    throw new AppError(400, `Topping không tồn tại hoặc đã gỡ: ${toppingIds.filter((t) => !ok.has(t)).join(', ')}`);
  }
}

const sizeRecipes = (sizes: SizeInput[]) => sizes.map((s) => ({ label: `Size ${s.name}`, items: s.recipe }));

// ---------- Đọc ----------

export async function listDrinks(query: ListDrinksQuery, role: Role) {
  const priceFilter =
    query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          sizes: {
            some: {
              isActive: true,
              price: {
                ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
                ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
              },
            },
          },
        }
      : {};
  const where: Prisma.DrinkWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.isAvailable !== undefined ? { isAvailable: query.isAvailable } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    ...(query.categoryId !== undefined ? { categoryId: query.categoryId === 'none' ? null : query.categoryId } : {}),
    ...priceFilter,
  };
  const [items, total] = await Promise.all([
    prisma.drink.findMany({
      where,
      include,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.drink.count({ where }),
  ]);
  const usable = await usableOf(prisma, items.flatMap((d) => d.sizes.map((s) => s.recipe)));
  return { items: items.map((d) => drinkDto(d, role, usable)), total, page: query.page, pageSize: query.pageSize };
}

export async function getDrink(id: number, role: Role) {
  const drink = await getOrThrow(id);
  const toppings = await prisma.drinkTopping.findMany({
    where: { drinkId: id, topping: { isActive: true } },
    select: { topping: { select: { id: true, name: true, price: true, isAvailable: true } } },
    orderBy: { topping: { name: 'asc' } },
  });
  const usable = await usableOf(prisma, drink.sizes.map((s) => s.recipe));
  return { ...drinkDto(drink, role, usable, true), toppings: toppings.map((t) => t.topping) };
}

/** Thực đơn bán hàng cho POS: món và topping đang bán, size đang dùng, cờ thiếu nguyên liệu. */
export async function getMenu() {
  const [categories, drinks] = await Promise.all([
    prisma.drinkCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    prisma.drink.findMany({
      where: { isActive: true, isAvailable: true },
      orderBy: { name: 'asc' },
      include: {
        sizes: activeSizes,
        toppings: {
          where: { topping: { isActive: true, isAvailable: true } },
          include: { topping: { include: { recipe: recipeInclude } } },
          orderBy: { topping: { name: 'asc' } },
        },
      },
    }),
  ]);
  const usable = await usableOf(prisma, [
    ...drinks.flatMap((d) => d.sizes.map((s) => s.recipe)),
    ...drinks.flatMap((d) => d.toppings.map((t) => t.topping.recipe)),
  ]);
  return {
    categories,
    drinks: drinks.map((d) => {
      const sizes = d.sizes.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        isDefault: s.isDefault,
        shortage: hasShortage(s.recipe, usable),
      }));
      return {
        id: d.id,
        name: d.name,
        categoryId: d.categoryId,
        imageUrl: d.imageUrl,
        description: d.description,
        sizes,
        toppings: d.toppings.map(({ topping: t }) => ({
          id: t.id,
          name: t.name,
          price: t.price,
          shortage: hasShortage(t.recipe, usable),
        })),
        shortage: sizes.some((s) => s.shortage),
      };
    }),
  };
}

// ---------- Ghi ----------

export async function createDrink(input: CreateDrinkInput, role: Role) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      await assertRecipeIngredients(tx, sizeRecipes(input.sizes));
      await assertToppings(tx, input.toppingIds ?? []);
      return tx.drink.create({
        data: {
          name: input.name,
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          // Mọi size đã có công thức (schema bắt buộc) nên bật bán ngay.
          isAvailable: !missingRecipe(input.sizes),
          sizes: {
            create: input.sizes.map((s, i) => ({
              name: s.name,
              price: s.price,
              sortOrder: s.sortOrder ?? i,
              isDefault: s.isDefault,
              recipe: { create: recipeLines(s.recipe) },
            })),
          },
          toppings: { create: (input.toppingIds ?? []).map((toppingId) => ({ toppingId })) },
        },
        select: { id: true },
      });
    });
    return getDrink(created.id, role);
  } catch (e) {
    mapWriteError(e);
  }
}

/** Sửa thông tin món; có `sizes` / `toppingIds` thì lưu luôn trong cùng giao dịch. */
export async function updateDrink(id: number, input: UpdateDrinkInput, role: Role) {
  const { sizes, toppingIds, ...info } = input;
  try {
    await prisma.$transaction(async (tx) => {
      await getOrThrow(id, tx);
      if (Object.values(info).some((v) => v !== undefined)) await tx.drink.update({ where: { id }, data: info });
      if (sizes) await writeSizes(tx, id, sizes);
      if (toppingIds) await writeToppings(tx, id, toppingIds);
    });
  } catch (e) {
    mapWriteError(e);
  }
  return getDrink(id, role);
}

/**
 * Lưu toàn bộ size và công thức của món. Size có `id` thì cập nhật, không có thì tạo mới
 * (trùng tên với size đã gỡ thì dùng lại size đó); size cũ không còn trong payload thì xóa.
 */
export async function saveSizes(drinkId: number, sizes: SizeInput[], role: Role) {
  await prisma.$transaction(async (tx) => {
    await getOrThrow(drinkId, tx);
    await writeSizes(tx, drinkId, sizes);
  });
  return getDrink(drinkId, role);
}

async function writeSizes(tx: Tx, drinkId: number, sizes: SizeInput[]) {
  await assertRecipeIngredients(tx, sizeRecipes(sizes));

  const existing = await tx.drinkSize.findMany({ where: { drinkId } });
  const byId = new Map(existing.map((s) => [s.id, s]));
  const foreign = sizes.filter((s) => s.id && !byId.has(s.id));
  if (foreign.length > 0) throw new AppError(400, `Size không thuộc món này: ${foreign.map((s) => s.name).join(', ')}`);

  // Size mới trùng tên size đã gỡ: dùng lại bản ghi cũ để không vướng unique (drinkId, name).
  const inactiveByName = new Map(existing.filter((s) => !s.isActive).map((s) => [s.name.toLowerCase(), s.id]));
  const resolved = sizes.map((s) => ({ ...s, id: s.id ?? inactiveByName.get(s.name.toLowerCase()) }));

  const keep = new Set(resolved.flatMap((s) => (s.id ? [s.id] : [])));
  const removed = existing.filter((s) => s.isActive && !keep.has(s.id)).map((s) => s.id);
  // Size đã có trong hóa đơn thì chỉ gỡ (isActive=false), chưa bán thì xóa cứng.
  if (removed.length > 0) {
    const sold = await tx.orderItem.findMany({ where: { sizeId: { in: removed } }, distinct: ['sizeId'], select: { sizeId: true } });
    const soldIds = sold.map((s) => s.sizeId);
    if (soldIds.length > 0) {
      await tx.drinkSize.updateMany({ where: { id: { in: soldIds } }, data: { isActive: false, isDefault: false } });
    }
    await tx.drinkSize.deleteMany({ where: { id: { in: removed.filter((id) => !soldIds.includes(id)) } } });
  }

  // Đặt tên tạm trước để đổi chéo tên (S <-> M) không vướng unique.
  for (const s of resolved) {
    if (s.id) await tx.drinkSize.update({ where: { id: s.id }, data: { name: `~${s.id}` } });
  }
  for (const [i, s] of resolved.entries()) {
    const data = { name: s.name, price: s.price, sortOrder: s.sortOrder ?? i, isDefault: s.isDefault, isActive: true };
    const sizeId = s.id
      ? (await tx.drinkSize.update({ where: { id: s.id }, data, select: { id: true } })).id
      : (await tx.drinkSize.create({ data: { ...data, drinkId }, select: { id: true } })).id;
    await tx.drinkRecipeItem.deleteMany({ where: { sizeId } });
    await tx.drinkRecipeItem.createMany({ data: recipeLines(s.recipe).map((l) => ({ ...l, sizeId })) });
  }
}

/** Thay toàn bộ danh sách topping được chọn cho món. */
export async function setDrinkToppings(drinkId: number, toppingIds: number[], role: Role) {
  await prisma.$transaction(async (tx) => {
    await getOrThrow(drinkId, tx);
    await writeToppings(tx, drinkId, toppingIds);
  });
  return getDrink(drinkId, role);
}

async function writeToppings(tx: Tx, drinkId: number, toppingIds: number[]) {
  await assertToppings(tx, toppingIds);
  await tx.drinkTopping.deleteMany({ where: { drinkId } });
  await tx.drinkTopping.createMany({ data: toppingIds.map((toppingId) => ({ drinkId, toppingId })) });
}

export async function setDrinkAvailability(id: number, isAvailable: boolean, role: Role) {
  const drink = await getOrThrow(id);
  if (isAvailable) {
    if (!drink.isActive) throw new AppError(400, 'Món đã bị gỡ khỏi thực đơn, không bật bán được');
    if (drink.sizes.length === 0) throw new AppError(400, 'Món chưa có size nào, không bật bán được');
    const noRecipe = drink.sizes.filter((s) => s.recipe.length === 0).map((s) => s.name);
    if (noRecipe.length > 0) throw new AppError(400, `Size chưa có công thức: ${noRecipe.join(', ')}`);
  }
  await prisma.drink.update({ where: { id }, data: { isAvailable } });
  return getDrink(id, role);
}

/** Gắn ảnh vừa upload cho món và xóa ảnh cũ. */
export async function setDrinkImage(id: number, filename: string, role: Role) {
  const url = publicUrl(IMAGE_FOLDER, filename);
  const drink = await prisma.drink.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!drink) {
    await removeUploaded(url);
    throw new AppError(404, 'Không tìm thấy đồ uống');
  }
  await prisma.drink.update({ where: { id }, data: { imageUrl: url } });
  await removeUploaded(drink.imageUrl);
  return getDrink(id, role);
}

/**
 * Xóa món. Đã có trong hóa đơn thì chỉ gỡ (isActive=false, isAvailable=false), giữ ảnh.
 */
export async function removeDrink(id: number) {
  const drink = await getOrThrow(id);
  if ((await prisma.orderItem.count({ where: { drinkId: id } })) > 0) {
    await prisma.drink.update({ where: { id }, data: { isActive: false, isAvailable: false } });
    return;
  }
  await prisma.drink.delete({ where: { id } });
  await removeUploaded(drink.imageUrl);
}
