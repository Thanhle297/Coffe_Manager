import { z } from 'zod';

const base = z.object({
  name: z
    .string({ error: 'Vui lòng nhập tên loại khách hàng' })
    .trim()
    .min(1, 'Vui lòng nhập tên loại khách hàng')
    .max(50, 'Tên loại khách hàng tối đa 50 ký tự'),
  minPoints: z
    .number({ error: 'Ngưỡng điểm không hợp lệ' })
    .int('Ngưỡng điểm không hợp lệ')
    .min(0, 'Ngưỡng điểm không được âm'),
  discountPercent: z
    .number({ error: 'Mức giảm giá không hợp lệ' })
    .int('Mức giảm giá không hợp lệ')
    .min(0, 'Mức giảm giá từ 0 đến 100')
    .max(100, 'Mức giảm giá từ 0 đến 100'),
});

export const createCustomerTypeSchema = base;
export const updateCustomerTypeSchema = base
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có thay đổi nào để cập nhật' });

export const typeIdParamSchema = z.object({
  id: z.coerce.number({ error: 'Mã loại khách hàng không hợp lệ' }).int().positive('Mã loại khách hàng không hợp lệ'),
});

export type CreateCustomerTypeInput = z.infer<typeof createCustomerTypeSchema>;
export type UpdateCustomerTypeInput = z.infer<typeof updateCustomerTypeSchema>;
