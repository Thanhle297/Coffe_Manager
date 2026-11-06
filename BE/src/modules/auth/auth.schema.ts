import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ error: 'Vui lòng nhập tên đăng nhập' })
    .trim()
    .toLowerCase()
    .min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string({ error: 'Vui lòng nhập mật khẩu' }).min(1, 'Vui lòng nhập mật khẩu'),
});

export const changePasswordSchema = z.object({
  oldPassword: z
    .string({ error: 'Vui lòng nhập mật khẩu hiện tại' })
    .min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  // bcrypt chỉ xét 72 byte đầu nên chặn trên 72 ký tự.
  newPassword: z
    .string({ error: 'Vui lòng nhập mật khẩu mới' })
    .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
    .max(72, 'Mật khẩu mới tối đa 72 ký tự'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
