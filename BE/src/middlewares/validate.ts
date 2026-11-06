import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './errorHandler.js';

export const validate =
  (schema: ZodType, source: 'body' | 'params' | 'query' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      throw new AppError(400, result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    }
    if (source === 'query') {
      // Express 5: req.query chỉ có getter nên phải định nghĩa lại để lấy dữ liệu đã ép kiểu.
      Object.defineProperty(req, 'query', { value: result.data, configurable: true, writable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
