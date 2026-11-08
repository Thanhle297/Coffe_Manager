import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { CreateDrinkCategoryInput, UpdateDrinkCategoryInput } from './drinkCategory.schema.js';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const NAME_TAKEN = 'Tên danh mục đã tồn tại';

async function getOrThrow(id: number) {
  const category = await prisma.drinkCategory.findUnique({ where: { id } });
  if (!category) throw new AppError(404, 'Không tìm thấy danh mục');
  return category;
}

export async function listDrinkCategories() {
  const categories = await prisma.drinkCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { drinks: { where: { isActive: true } } } } },
  });
  return categories.map(({ _count, ...c }) => ({ ...c, drinkCount: _count.drinks }));
}

export async function createDrinkCategory(input: CreateDrinkCategoryInput) {
  try {
    return await prisma.drinkCategory.create({ data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

export async function updateDrinkCategory(id: number, input: UpdateDrinkCategoryInput) {
  await getOrThrow(id);
  try {
    return await prisma.drinkCategory.update({ where: { id }, data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

/**
 * Chỉ xóa được danh mục không còn món đang dùng (khớp cột "Số món", PB-03).
 * Món đã gỡ khỏi thực đơn còn trỏ tới danh mục thì chuyển về "Chưa phân loại".
 */
export async function removeDrinkCategory(id: number) {
  await getOrThrow(id);
  await prisma.$transaction(async (tx) => {
    const used = await tx.drink.count({ where: { categoryId: id, isActive: true } });
    if (used > 0) {
      throw new AppError(409, `Danh mục đang có ${used} món, hãy chuyển các món sang danh mục khác trước`);
    }
    await tx.drink.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    await tx.drinkCategory.delete({ where: { id } });
  });
}
