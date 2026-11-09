import { z } from 'zod';
import { EmployeeStatus, Gender } from '../../generated/prisma/enums.js';
import { dateString, idParamSchema, optionalText, pagingQuery } from '../../lib/zodHelpers.js';

const fullName = z
  .string({ error: 'Vui lòng nhập họ tên' })
  .trim()
  .min(1, 'Vui lòng nhập họ tên')
  .max(100, 'Họ tên tối đa 100 ký tự');

const gender = z.enum(Gender, { error: 'Giới tính không hợp lệ' });

const position = z
  .string({ error: 'Vui lòng nhập chức vụ' })
  .trim()
  .min(1, 'Vui lòng nhập chức vụ')
  .max(50, 'Chức vụ tối đa 50 ký tự');

/** Cùng quy tắc với số điện thoại khách hàng; rỗng thì thành null. */
const phone = z
  .string({ error: 'Số điện thoại không hợp lệ' })
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^(0\d{9})?$/, 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0'))
  .transform((v) => (v === '' ? null : v))
  .nullable();

const hireDate = dateString('Ngày vào làm').refine(
  (d) => d.getTime() <= Date.now() + 365 * 86_400_000,
  'Ngày vào làm không được quá một năm sau hôm nay',
);

export const createEmployeeSchema = z.object({
  fullName,
  gender,
  position,
  phone: phone.optional(),
  address: optionalText('Địa chỉ', 255).optional(),
  hireDate,
});

export const updateEmployeeSchema = z
  .object({
    fullName: fullName.optional(),
    gender: gender.optional(),
    position: position.optional(),
    phone: phone.optional(),
    address: optionalText('Địa chỉ', 255).optional(),
    hireDate: hireDate.optional(),
    status: z.enum(EmployeeStatus, { error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào để cập nhật' });

export const linkAccountSchema = z.object({
  accountId: z.number({ error: 'Tài khoản không hợp lệ' }).int().positive('Tài khoản không hợp lệ').nullable(),
});

export const employeeIdParamSchema = idParamSchema('nhân viên');

export const listEmployeesQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(EmployeeStatus, { error: 'Trạng thái không hợp lệ' }).optional(),
  position: z.string().trim().optional(),
  ...pagingQuery,
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
