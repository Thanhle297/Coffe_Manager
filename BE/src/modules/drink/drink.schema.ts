import { z } from 'zod';
import { boolQuery, idParamSchema, optionalText, pagingQuery } from '../../lib/zodHelpers.js';
import { recipeSchema } from './recipe.js';

const name = z
  .string({ error: 'Vui lòng nhập tên đồ uống' })
  .trim()
  .min(1, 'Vui lòng nhập tên đồ uống')
  .max(100, 'Tên đồ uống tối đa 100 ký tự');

const categoryId = z
  .number({ error: 'Danh mục không hợp lệ' })
  .int()
  .positive('Danh mục không hợp lệ')
  .nullable();

const price = z
  .number({ error: 'Giá không hợp lệ' })
  .int('Giá phải là số nguyên')
  .min(0, 'Giá không được âm')
  .max(10_000_000, 'Giá quá lớn');

export const sizeSchema = z.object({
  id: z.number({ error: 'Size không hợp lệ' }).int().positive('Size không hợp lệ').optional(),
  name: z
    .string({ error: 'Vui lòng nhập tên size' })
    .trim()
    .min(1, 'Vui lòng nhập tên size')
    .max(20, 'Tên size tối đa 20 ký tự'),
  price,
  sortOrder: z.number({ error: 'Thứ tự không hợp lệ' }).int().min(0).max(9999).optional(),
  isDefault: z.boolean({ error: 'Size mặc định không hợp lệ' }).default(false),
  recipe: recipeSchema(30),
});

const sizes = z
  .array(sizeSchema, { error: 'Danh sách size không hợp lệ' })
  .min(1, 'Món phải có ít nhất một size')
  .max(5, 'Món tối đa 5 size')
  .refine((s) => s.filter((x) => x.isDefault).length === 1, { message: 'Phải chọn đúng một size mặc định' })
  .refine((s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length, { message: 'Size bị trùng tên' })
  .refine((s) => {
    const ids = s.flatMap((x) => (x.id ? [x.id] : []));
    return new Set(ids).size === ids.length;
  }, { message: 'Size bị lặp' });

const toppingIds = z
  .array(z.number({ error: 'Topping không hợp lệ' }).int().positive('Topping không hợp lệ'), {
    error: 'Danh sách topping không hợp lệ',
  })
  .max(100, 'Danh sách topping quá dài')
  .transform((ids) => [...new Set(ids)]);

export const createDrinkSchema = z.object({
  name,
  categoryId: categoryId.optional(),
  description: optionalText('Mô tả', 500).optional(),
  sizes,
  toppingIds: toppingIds.optional(),
});

export const updateDrinkSchema = z
  .object({
    name: name.optional(),
    categoryId: categoryId.optional(),
    description: optionalText('Mô tả', 500).optional(),
    // Gửi kèm để lưu thông tin, size/công thức và topping trong một giao dịch (PB-01).
    sizes: sizes.optional(),
    toppingIds: toppingIds.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const saveSizesSchema = z.object({ sizes });

export const drinkToppingsSchema = z.object({ toppingIds });

export const availabilitySchema = z.object({
  isAvailable: z.boolean({ error: 'Trạng thái bán không hợp lệ' }),
});

export const listDrinksQuerySchema = z.object({
  q: z.string().trim().optional(),
  // Số id của danh mục, hoặc 'none' để lọc món chưa phân loại.
  categoryId: z
    .union([z.literal('none'), z.coerce.number().int().positive()], { error: 'Danh mục không hợp lệ' })
    .optional(),
  isAvailable: boolQuery.optional(),
  includeInactive: boolQuery.optional(),
  minPrice: z.coerce.number({ error: 'Giá không hợp lệ' }).int().min(0).optional(),
  maxPrice: z.coerce.number({ error: 'Giá không hợp lệ' }).int().min(0).optional(),
  ...pagingQuery,
});

export const drinkIdParamSchema = idParamSchema('đồ uống');

export type SizeInput = z.infer<typeof sizeSchema>;
export type CreateDrinkInput = z.infer<typeof createDrinkSchema>;
export type UpdateDrinkInput = z.infer<typeof updateDrinkSchema>;
export type ListDrinksQuery = z.infer<typeof listDrinksQuerySchema>;
