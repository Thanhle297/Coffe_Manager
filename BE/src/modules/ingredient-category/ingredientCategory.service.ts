import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type {
  CreateIngredientCategoryInput,
  UpdateIngredientCategoryInput,
} from './ingredientCategory.schema.js';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const NAME_TAKEN = 'Tên loại nguyên liệu đã tồn tại';

async function getOrThrow(id: number) {
  const category = await prisma.ingredientCategory.findUnique({ where: { id } });
  if (!category) throw new AppError(404, 'Không tìm thấy loại nguyên liệu');
  return category;
}

export async function listIngredientCategories() {
  const categories = await prisma.ingredientCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { ingredients: true } } },
  });
  return categories.map(({ _count, ...c }) => ({ ...c, ingredientCount: _count.ingredients }));
}

export async function createIngredientCategory(input: CreateIngredientCategoryInput) {
  try {
    return await prisma.ingredientCategory.create({ data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

export async function updateIngredientCategory(id: number, input: UpdateIngredientCategoryInput) {
  await getOrThrow(id);
  try {
    return await prisma.ingredientCategory.update({ where: { id }, data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

/** Chỉ xóa được loại chưa có nguyên liệu nào (kể cả nguyên liệu đã ẩn). */
export async function removeIngredientCategory(id: number) {
  await getOrThrow(id);
  const used = await prisma.ingredient.count({ where: { categoryId: id } });
  if (used > 0) {
    throw new AppError(409, `Loại đang được dùng cho ${used} nguyên liệu, hãy chuyển các nguyên liệu sang loại khác trước`);
  }
  await prisma.ingredientCategory.delete({ where: { id } });
}
