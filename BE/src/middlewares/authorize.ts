import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { AppError } from './errorHandler.js';

export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'Bạn không có quyền thực hiện thao tác này');
    }
    next();
  };
