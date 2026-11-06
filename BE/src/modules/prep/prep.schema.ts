import { z } from 'zod';
import { decimalNumber, idParamSchema, pagingQuery, positiveQuantity, ymdString } from '../../lib/zodHelpers.js';

export const createPrepBatchSchema = z.object({
  preparedId: z.number({ error: 'Vui lòng chọn bán thành phẩm' }).int().positive('Vui lòng chọn bán thành phẩm'),
  batches: decimalNumber('Số mẻ', 2, 1000).refine((v) => v > 0, 'Số mẻ phải lớn hơn 0'),
  actualQty: positiveQuantity('Sản lượng thực tế').optional(),
  note: z.string({ error: 'Ghi chú không hợp lệ' }).trim().max(255, 'Ghi chú tối đa 255 ký tự').optional(),
});

export const listPrepBatchesQuerySchema = z.object({
  from: ymdString('Từ ngày').optional(),
  to: ymdString('Đến ngày').optional(),
  preparedId: z.coerce.number().int().positive().optional(),
  ...pagingQuery,
});

export const prepBatchIdParamSchema = idParamSchema('phiếu sơ chế');

export type CreatePrepBatchInput = z.infer<typeof createPrepBatchSchema>;
export type ListPrepBatchesQuery = z.infer<typeof listPrepBatchesQuerySchema>;
