import { z } from 'zod';
import { Role } from '../../generated/prisma/enums.js';

const roleSchema = z.enum([Role.MANAGER, Role.STAFF], { error: 'Vai trò không hợp lệ' });

export const createAccountSchema = z.object({
  username: z
    .string({ error: 'Vui lòng nhập tên đăng nhập' })
    .trim()
    .toLowerCase()
    .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
    .max(50, 'Tên đăng nhập tối đa 50 ký tự')
    .regex(/^[a-z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới và gạch ngang'),
  password: z
    .string({ error: 'Vui lòng nhập mật khẩu' })
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .max(72, 'Mật khẩu tối đa 72 ký tự'),
  fullName: z
    .string({ error: 'Vui lòng nhập họ tên' })
    .trim()
    .min(1, 'Vui lòng nhập họ tên')
    .max(100, 'Họ tên tối đa 100 ký tự'),
  role: roleSchema.default(Role.STAFF),
});

export const updateAccountSchema = z
  .object({
    role: roleSchema.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const idParamSchema = z.object({
  id: z.coerce.number({ error: 'Mã tài khoản không hợp lệ' }).int().positive('Mã tài khoản không hợp lệ'),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
