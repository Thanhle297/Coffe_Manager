import { z } from 'zod';
import { idParamSchema } from '../../lib/zodHelpers.js';

const name = z
  .string({ error: 'Vui lòng nhập tên danh mục' })
  .trim()
  .min(1, 'Vui lòng nhập tên danh mục')
  .max(50, 'Tên danh mục tối đa 50 ký tự');

const sortOrder = z
  .number({ error: 'Thứ tự không hợp lệ' })
  .int('Thứ tự phải là số nguyên')
  .min(0, 'Thứ tự không được âm')
  .max(9999, 'Thứ tự tối đa 9999');

export const createDrinkCategorySchema = z.object({ name, sortOrder: sortOrder.default(0) });

export const updateDrinkCategorySchema = z
  .object({ name: name.optional(), sortOrder: sortOrder.optional() })
  .refine((v) => v.name !== undefined || v.sortOrder !== undefined, {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const drinkCategoryIdParamSchema = idParamSchema('danh mục');

export type CreateDrinkCategoryInput = z.infer<typeof createDrinkCategorySchema>;
export type UpdateDrinkCategoryInput = z.infer<typeof updateDrinkCategorySchema>;
