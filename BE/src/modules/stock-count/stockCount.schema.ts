import { z } from 'zod';
import { idParamSchema, pagingQuery, quantity, ymdString } from '../../lib/zodHelpers.js';

export const createStockCountSchema = z.object({
  note: z.string({ error: 'Ghi chú không hợp lệ' }).trim().max(255, 'Ghi chú tối đa 255 ký tự').optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.number({ error: 'Nguyên liệu không hợp lệ' }).int().positive('Nguyên liệu không hợp lệ'),
        actualQty: quantity('Số đếm thực tế'),
      }),
      { error: 'Danh sách nguyên liệu không hợp lệ' },
    )
    .min(1, 'Phiếu kiểm kê phải có ít nhất một nguyên liệu')
    .max(500, 'Phiếu kiểm kê tối đa 500 dòng')
    .refine((items) => new Set(items.map((i) => i.ingredientId)).size === items.length, {
      message: 'Một nguyên liệu chỉ được xuất hiện một lần trong phiếu',
    }),
});

export const listStockCountsQuerySchema = z.object({
  from: ymdString('Từ ngày').optional(),
  to: ymdString('Đến ngày').optional(),
  ...pagingQuery,
});

export const stockCountIdParamSchema = idParamSchema('phiếu kiểm kê');

export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;
export type ListStockCountsQuery = z.infer<typeof listStockCountsQuerySchema>;
