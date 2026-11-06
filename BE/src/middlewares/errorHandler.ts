import type { ErrorRequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Dữ liệu gửi lên không hợp lệ' });
    return;
  }
  console.error(err);
  res.status(500).json({ message: 'Lỗi hệ thống' });
};
