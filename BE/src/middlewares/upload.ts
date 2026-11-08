import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from './errorHandler.js';

/** Thư mục gốc chứa file upload, phục vụ tĩnh tại `/uploads`. */
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');

const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_SIZE = 2 * 1024 * 1024;

/** Nhận một ảnh ở field `field`, lưu vào `uploads/<folder>/` với tên ngẫu nhiên. */
export function uploadImage(folder: string, field = 'image'): RequestHandler {
  const dir = path.join(UPLOAD_ROOT, folder);
  mkdirSync(dir, { recursive: true });
  const handler = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_SIZE, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (EXT[file.mimetype]) cb(null, true);
      else cb(new AppError(400, 'Chỉ nhận ảnh JPEG, PNG hoặc WebP'));
    },
  }).single(field);

  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        next(new AppError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh tối đa 2 MB' : 'Tệp tải lên không hợp lệ'));
        return;
      }
      if (err) return next(err);
      if (!req.file) return next(new AppError(400, 'Vui lòng chọn ảnh'));
      next();
    });
  };
}

/** URL công khai (`/uploads/...`) của file đã lưu. */
export const publicUrl = (folder: string, filename: string) => `/uploads/${folder}/${filename}`;

/** Xóa file theo URL `/uploads/...`; bỏ qua nếu không tồn tại hoặc nằm ngoài thư mục upload. */
export async function removeUploaded(url: string | null | undefined) {
  if (!url?.startsWith('/uploads/')) return;
  const file = path.resolve(UPLOAD_ROOT, url.slice('/uploads/'.length));
  if (!file.startsWith(UPLOAD_ROOT + path.sep)) return;
  await unlink(file).catch(() => undefined);
}
