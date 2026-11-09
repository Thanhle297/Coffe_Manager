import { z } from 'zod';
import { OrderStatus, PaymentMethod } from '../../generated/prisma/enums.js';
import { idParamSchema, optionalText, pagingQuery, ymdString } from '../../lib/zodHelpers.js';
import { MAX_TOPPING_PORTIONS } from '../drink/menu.js';

const id = (label: string) => z.number({ error: `${label} không hợp lệ` }).int().positive(`${label} không hợp lệ`);

export const MAX_ITEM_QTY = 999;

export const openOrderSchema = z.object({
  tableId: id('Bàn'),
  customerId: id('Khách hàng').nullable().optional(),
  note: optionalText('Ghi chú', 255).optional(),
});

export const updateOrderSchema = z.object({
  note: optionalText('Ghi chú', 255),
});

export const addItemSchema = z.object({
  drinkId: id('Đồ uống'),
  sizeId: id('Size'),
  toppings: z
    .array(
      z.object({
        toppingId: id('Topping'),
        quantity: z
          .number({ error: 'Số phần topping không hợp lệ' })
          .int('Số phần topping không hợp lệ')
          .min(1, `Mỗi topping được chọn từ 1 đến ${MAX_TOPPING_PORTIONS} phần`)
          .max(MAX_TOPPING_PORTIONS, `Mỗi topping được chọn từ 1 đến ${MAX_TOPPING_PORTIONS} phần`),
      }),
      { error: 'Topping không hợp lệ' },
    )
    .max(10, 'Tối đa 10 loại topping trên một ly')
    .default([]),
  quantity: z
    .number({ error: 'Số lượng không hợp lệ' })
    .int('Số lượng không hợp lệ')
    .min(1, 'Số lượng phải lớn hơn 0')
    .max(99, 'Mỗi lần thêm tối đa 99 ly'),
  note: optionalText('Ghi chú món', 255).optional(),
});

export const updateItemSchema = z
  .object({
    quantity: z
      .number({ error: 'Số lượng không hợp lệ' })
      .int('Số lượng không hợp lệ')
      .min(0, 'Số lượng không được âm')
      .max(MAX_ITEM_QTY, `Số lượng tối đa ${MAX_ITEM_QTY}`)
      .optional(),
    note: optionalText('Ghi chú món', 255).optional(),
  })
  .refine((v) => v.quantity !== undefined || v.note !== undefined, { message: 'Không có thay đổi nào để cập nhật' });

export const setCustomerSchema = z.object({
  customerId: id('Khách hàng').nullable(),
});

const points = z.coerce
  .number({ error: 'Số điểm không hợp lệ' })
  .int('Số điểm không hợp lệ')
  .min(0, 'Số điểm không được âm')
  .max(1_000_000_000, 'Số điểm quá lớn');

export const previewQuerySchema = z.object({
  redeemPoints: points.default(0),
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(PaymentMethod, { error: 'Phương thức thanh toán không hợp lệ' }),
  redeemPoints: points.default(0),
});

export const orderIdParamSchema = idParamSchema('đơn');

export const itemParamSchema = z.object({
  id: z.coerce.number({ error: 'Mã đơn không hợp lệ' }).int().positive('Mã đơn không hợp lệ'),
  itemId: z.coerce.number({ error: 'Mã dòng không hợp lệ' }).int().positive('Mã dòng không hợp lệ'),
});

const optionalId = z.coerce.number().int().positive().optional();

export const listOrdersQuerySchema = z
  .object({
    from: ymdString('Từ ngày').optional(),
    to: ymdString('Đến ngày').optional(),
    status: z.enum(OrderStatus, { error: 'Trạng thái không hợp lệ' }).optional(),
    tableId: optionalId,
    customerId: optionalId,
    staffId: optionalId,
    q: z.string().trim().optional(),
    ...pagingQuery,
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'Từ ngày phải trước hoặc bằng đến ngày' });

export type OpenOrderInput = z.infer<typeof openOrderSchema>;
export type AddItemInput = z.infer<typeof addItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type PayOrderInput = z.infer<typeof payOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
