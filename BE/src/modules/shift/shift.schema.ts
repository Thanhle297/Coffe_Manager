import { z } from 'zod';
import { boolQuery, idParamSchema } from '../../lib/zodHelpers.js';

const name = z
  .string({ error: 'Vui lòng nhập tên ca' })
  .trim()
  .min(1, 'Vui lòng nhập tên ca')
  .max(50, 'Tên ca tối đa 50 ký tự');

const time = (label: string) =>
  z.string({ error: `${label} không hợp lệ` }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} phải có dạng HH:mm`);

const pay = z
  .number({ error: 'Tiền ca không hợp lệ' })
  .int('Tiền ca phải là số nguyên')
  .min(0, 'Tiền ca không được âm')
  .max(100_000_000, 'Tiền ca quá lớn');

const SAME_TIME = { message: 'Giờ bắt đầu và kết thúc phải khác nhau', path: ['endTime'] };

export const createShiftSchema = z
  .object({ name, startTime: time('Giờ bắt đầu'), endTime: time('Giờ kết thúc'), pay })
  .refine((v) => v.startTime !== v.endTime, SAME_TIME);

/** Sửa ca: giờ được kiểm tra lại ở service khi chỉ gửi một trong hai mốc. */
export const updateShiftSchema = z
  .object({
    name: name.optional(),
    startTime: time('Giờ bắt đầu').optional(),
    endTime: time('Giờ kết thúc').optional(),
    pay: pay.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào để cập nhật' })
  .refine((v) => !v.startTime || !v.endTime || v.startTime !== v.endTime, SAME_TIME);

export const shiftIdParamSchema = idParamSchema('ca làm');

export const listShiftsQuerySchema = z.object({
  includeInactive: boolQuery.optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
