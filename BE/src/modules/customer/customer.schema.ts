import { z } from 'zod';

const phone = z
  .string({ error: 'Vui lòng nhập số điện thoại' })
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^0\d{9}$/, 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0'));

const fullName = z
  .string({ error: 'Vui lòng nhập họ tên' })
  .trim()
  .min(1, 'Vui lòng nhập họ tên')
  .max(100, 'Họ tên tối đa 100 ký tự');

const address = z
  .string({ error: 'Địa chỉ không hợp lệ' })
  .trim()
  .max(255, 'Địa chỉ tối đa 255 ký tự')
  .transform((v) => (v === '' ? null : v))
  .nullable();

const birthday = z
  .string({ error: 'Ngày sinh không hợp lệ' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải có dạng YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(), 'Ngày sinh không hợp lệ')
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .nullable();

export const createCustomerSchema = z.object({
  fullName,
  phone,
  address: address.optional(),
  birthday: birthday.optional(),
});

export const updateCustomerSchema = z
  .object({
    fullName: fullName.optional(),
    phone: phone.optional(),
    address: address.optional(),
    birthday: birthday.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const customerIdParamSchema = z.object({
  id: z.coerce.number({ error: 'Mã khách hàng không hợp lệ' }).int().positive('Mã khách hàng không hợp lệ'),
});

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().optional(),
  typeId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const pointHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adjustPointsSchema = z.object({
  delta: z
    .number({ error: 'Số điểm điều chỉnh không hợp lệ' })
    .int('Số điểm điều chỉnh không hợp lệ')
    .refine((v) => v !== 0, 'Số điểm điều chỉnh phải khác 0'),
  note: z
    .string({ error: 'Vui lòng nhập lý do điều chỉnh' })
    .trim()
    .min(1, 'Vui lòng nhập lý do điều chỉnh')
    .max(255, 'Lý do tối đa 255 ký tự'),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type PointHistoryQuery = z.infer<typeof pointHistoryQuerySchema>;
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;
