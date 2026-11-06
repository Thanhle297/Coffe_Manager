import { z } from 'zod';

/** Chuỗi `YYYY-MM-DD` hợp lệ, trả về Date ở 00:00 UTC. */
export const dateString = (label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} phải có dạng YYYY-MM-DD`)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, `${label} không hợp lệ`)
    .transform((v) => new Date(`${v}T00:00:00.000Z`));

/** Chuỗi ngày giữ nguyên dạng string (dùng cho bộ lọc). */
export const ymdString = (label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} phải có dạng YYYY-MM-DD`)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, `${label} không hợp lệ`);

/** Số có tối đa `dp` chữ số thập phân và không vượt `max`. */
export const decimalNumber = (label: string, dp: number, max: number) =>
  z
    .number({ error: `${label} không hợp lệ` })
    .finite(`${label} không hợp lệ`)
    .refine((v) => Math.abs(v * 10 ** dp - Math.round(v * 10 ** dp)) < 1e-6, `${label} tối đa ${dp} chữ số thập phân`)
    .refine((v) => v <= max, `${label} quá lớn`);

export const quantity = (label: string) =>
  decimalNumber(label, 3, 999_999_999).refine((v) => v >= 0, `${label} không được âm`);

export const positiveQuantity = (label: string) =>
  decimalNumber(label, 3, 999_999_999).refine((v) => v > 0, `${label} phải lớn hơn 0`);

export const money = (label: string) =>
  decimalNumber(label, 2, 9_999_999_999).refine((v) => v >= 0, `${label} không được âm`);

export const idParamSchema = (label: string) =>
  z.object({
    id: z.coerce.number({ error: `Mã ${label} không hợp lệ` }).int().positive(`Mã ${label} không hợp lệ`),
  });

export const pagingQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Chuỗi tùy chọn: rỗng thì thành null. */
export const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .transform((v) => (v === '' ? null : v))
    .nullable();

/** Đơn giá theo đơn vị gốc: tối đa 4 chữ số thập phân. */
export const unitPrice = (label: string) =>
  decimalNumber(label, 4, 9_999_999_999).refine((v) => v >= 0, `${label} không được âm`);
