import { z } from 'zod';
import { idParamSchema } from '../../lib/zodHelpers.js';

const name = z
  .string({ error: 'Vui lòng nhập tên loại' })
  .trim()
  .min(1, 'Vui lòng nhập tên loại')
  .max(50, 'Tên loại tối đa 50 ký tự');

// Icon là emoji hoặc ký tự ngắn do Quản lý chọn (ví dụ ☕, 🥛).
const icon = z
  .string({ error: 'Vui lòng chọn icon' })
  .trim()
  .min(1, 'Vui lòng chọn icon')
  .max(16, 'Icon quá dài');

export const createIngredientCategorySchema = z.object({ name, icon });

export const updateIngredientCategorySchema = z
  .object({ name: name.optional(), icon: icon.optional() })
  .refine((v) => v.name !== undefined || v.icon !== undefined, {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const ingredientCategoryIdParamSchema = idParamSchema('loại nguyên liệu');

export type CreateIngredientCategoryInput = z.infer<typeof createIngredientCategorySchema>;
export type UpdateIngredientCategoryInput = z.infer<typeof updateIngredientCategorySchema>;
