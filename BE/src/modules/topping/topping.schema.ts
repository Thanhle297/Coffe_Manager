import { z } from 'zod';
import { boolQuery, idParamSchema } from '../../lib/zodHelpers.js';
import { recipeSchema } from '../drink/recipe.js';

const name = z
  .string({ error: 'Vui lòng nhập tên topping' })
  .trim()
  .min(1, 'Vui lòng nhập tên topping')
  .max(50, 'Tên topping tối đa 50 ký tự');

const price = z
  .number({ error: 'Giá không hợp lệ' })
  .int('Giá phải là số nguyên')
  .min(0, 'Giá không được âm')
  .max(10_000_000, 'Giá quá lớn');

const recipe = recipeSchema(10);

export const createToppingSchema = z.object({ name, price, recipe });

export const updateToppingSchema = z
  .object({ name: name.optional(), price: price.optional(), recipe: recipe.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const toppingDrinksSchema = z.object({
  drinkIds: z
    .array(z.number({ error: 'Món không hợp lệ' }).int().positive('Món không hợp lệ'), { error: 'Danh sách món không hợp lệ' })
    .max(500, 'Danh sách món quá dài')
    .transform((ids) => [...new Set(ids)]),
});

export const availabilitySchema = z.object({
  isAvailable: z.boolean({ error: 'Trạng thái bán không hợp lệ' }),
});

export const listToppingsQuerySchema = z.object({
  q: z.string().trim().optional(),
  includeInactive: boolQuery.optional(),
});

export const toppingIdParamSchema = idParamSchema('topping');

export type CreateToppingInput = z.infer<typeof createToppingSchema>;
export type UpdateToppingInput = z.infer<typeof updateToppingSchema>;
export type ListToppingsQuery = z.infer<typeof listToppingsQuerySchema>;
