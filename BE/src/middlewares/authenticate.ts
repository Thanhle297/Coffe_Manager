import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const INVALID_SESSION = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn';

function build(allowPendingPasswordChange: boolean): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Chưa đăng nhập');

    let payload;
    try {
      payload = verifyToken(header.slice(7));
    } catch {
      throw new AppError(401, INVALID_SESSION);
    }

    const account = await prisma.account.findUnique({ where: { id: Number(payload.sub) } });
    // So `ver` với tokenVersion trong DB: lệch nghĩa là token đã bị thu hồi.
    if (!account || !account.isActive || account.tokenVersion !== payload.ver) {
      throw new AppError(401, INVALID_SESSION);
    }

    if (account.mustChangePassword && !allowPendingPasswordChange) {
      throw new AppError(403, 'Bạn cần đổi mật khẩu trước khi tiếp tục');
    }

    req.user = {
      id: account.id,
      username: account.username,
      fullName: account.fullName,
      role: account.role,
      mustChangePassword: account.mustChangePassword,
    };
    next();
  };
}

/** Yêu cầu đăng nhập; chặn tài khoản còn `mustChangePassword`. */
export const authenticate = build(false);

/** Như `authenticate` nhưng cho qua khi `mustChangePassword` (chỉ dùng cho /auth/me, /auth/change-password). */
export const authenticateAllowPending = build(true);
