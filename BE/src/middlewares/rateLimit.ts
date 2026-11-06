import { rateLimit } from 'express-rate-limit';

/** Giới hạn theo IP cho đăng nhập, bổ sung cho cơ chế khóa tài khoản sau 3 lần sai. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
});
