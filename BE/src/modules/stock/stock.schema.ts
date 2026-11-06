import { z } from 'zod';
import { StockOutReason } from '../../generated/prisma/enums.js';
import {
  dateString,
  idParamSchema,
  money,
  pagingQuery,
  positiveQuantity,
  unitPrice,
  ymdString,
} from '../../lib/zodHelpers.js';

const ingredientId = z.number({ error: 'Nguyên liệu không hợp lệ' }).int().positive('Nguyên liệu không hợp lệ');
const note = z.string({ error: 'Ghi chú không hợp lệ' }).trim().max(255, 'Ghi chú tối đa 255 ký tự');

const positiveId = (label: string) =>
  z.number({ error: `${label} không hợp lệ` }).int().positive(`${label} không hợp lệ`);

/**
 * Mỗi dòng nhập nhận một trong hai dạng:
 * - theo quy cách: `{ purchaseUnitId, packQty, packPrice }`
 * - theo đơn vị gốc: `{ quantity, unitPrice }`
 */
const stockInLine = z
  .object({
    ingredientId,
    purchaseUnitId: positiveId('Quy cách').optional(),
    packQty: positiveQuantity('Số quy cách').optional(),
    packPrice: money('Giá một quy cách').optional(),
    quantity: positiveQuantity('Số lượng').optional(),
    unitPrice: unitPrice('Đơn giá').optional(),
    expiryDate: dateString('Hạn sử dụng').nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.purchaseUnitId !== undefined) {
      if (v.packQty === undefined) ctx.addIssue({ code: 'custom', path: ['packQty'], message: 'Vui lòng nhập số quy cách' });
      if (v.packPrice === undefined)
        ctx.addIssue({ code: 'custom', path: ['packPrice'], message: 'Vui lòng nhập giá một quy cách' });
    } else {
      if (v.quantity === undefined) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Vui lòng nhập số lượng' });
      if (v.unitPrice === undefined) ctx.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Vui lòng nhập đơn giá' });
    }
  });

export const createStockInSchema = z.object({
  supplierId: z.number({ error: 'Vui lòng chọn nhà cung cấp' }).int().positive('Vui lòng chọn nhà cung cấp'),
  importDate: dateString('Ngày nhập'),
  note: note.optional(),
  items: z
    .array(stockInLine, { error: 'Danh sách nguyên liệu không hợp lệ' })
    .min(1, 'Phiếu nhập phải có ít nhất một nguyên liệu')
    .max(200, 'Phiếu nhập tối đa 200 dòng')
    .refine((items) => new Set(items.map((i) => i.ingredientId)).size === items.length, {
      message: 'Một nguyên liệu chỉ được xuất hiện một lần trong phiếu',
    }),
});

export const createStockOutSchema = z
  .object({
    // SALE và PREP do hệ thống tạo, không nhận từ client.
    reason: z.enum([StockOutReason.USAGE, StockOutReason.DISCARD, StockOutReason.ADJUST], {
      error: 'Lý do xuất kho không hợp lệ',
    }),
    note: note.optional(),
    items: z
      .array(
        z.object({ ingredientId, quantity: positiveQuantity('Số lượng'), lotId: positiveId('Lô').optional() }),
        { error: 'Danh sách nguyên liệu không hợp lệ' },
      )
      .min(1, 'Phiếu xuất phải có ít nhất một nguyên liệu')
      .max(200, 'Phiếu xuất tối đa 200 dòng'),
  })
  .refine((v) => v.reason !== StockOutReason.DISCARD || (v.note ?? '') !== '', {
    path: ['note'],
    message: 'Vui lòng nhập ghi chú khi hủy nguyên liệu',
  });

export const discardExpiredSchema = z.object({
  ingredientIds: z.array(ingredientId, { error: 'Danh sách nguyên liệu không hợp lệ' }).max(500).optional(),
});

export const stockIdParamSchema = idParamSchema('phiếu');

const dateRange = {
  from: ymdString('Từ ngày').optional(),
  to: ymdString('Đến ngày').optional(),
};

export const listStockInQuerySchema = z.object({
  ...dateRange,
  supplierId: z.coerce.number().int().positive().optional(),
  ...pagingQuery,
});

export const listStockOutQuerySchema = z.object({
  ...dateRange,
  reason: z.enum(StockOutReason, { error: 'Lý do xuất kho không hợp lệ' }).optional(),
  ...pagingQuery,
});

export type CreateStockInInput = z.infer<typeof createStockInSchema>;
export type CreateStockOutInput = z.infer<typeof createStockOutSchema>;
export type DiscardExpiredInput = z.infer<typeof discardExpiredSchema>;
export type ListStockInQuery = z.infer<typeof listStockInQuerySchema>;
export type ListStockOutQuery = z.infer<typeof listStockOutQuerySchema>;
