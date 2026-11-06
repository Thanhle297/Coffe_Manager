import { z } from 'zod';
import { boolQuery, idParamSchema, optionalText, pagingQuery } from '../../lib/zodHelpers.js';

const name = z
  .string({ error: 'Vui lòng nhập tên nhà cung cấp' })
  .trim()
  .min(1, 'Vui lòng nhập tên nhà cung cấp')
  .max(100, 'Tên nhà cung cấp tối đa 100 ký tự');

const email = z
  .string({ error: 'Email không hợp lệ' })
  .trim()
  .max(100, 'Email tối đa 100 ký tự')
  .transform((v) => (v === '' ? null : v))
  .pipe(z.email('Email không hợp lệ').nullable())
  .nullable();

const phone = z
  .string({ error: 'Số điện thoại không hợp lệ' })
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\+?\d{8,15}$/, 'Số điện thoại phải gồm 8-15 chữ số')
      .or(z.literal('').transform(() => null)),
  )
  .nullable();

const fields = {
  address: optionalText('Địa chỉ', 255),
  email,
  phone,
  description: optionalText('Mô tả', 500),
};

export const createSupplierSchema = z.object({
  name,
  address: fields.address.optional(),
  email: fields.email.optional(),
  phone: fields.phone.optional(),
  description: fields.description.optional(),
});

export const updateSupplierSchema = z
  .object({
    name: name.optional(),
    address: fields.address.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    description: fields.description.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const supplierIdParamSchema = idParamSchema('nhà cung cấp');

export const listSuppliersQuerySchema = z.object({
  q: z.string().trim().optional(),
  isActive: boolQuery.optional(),
  ...pagingQuery,
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
