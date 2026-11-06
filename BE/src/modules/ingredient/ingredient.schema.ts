import { z } from 'zod';
import { IngredientType } from '../../generated/prisma/enums.js';
import {
  boolQuery,
  decimalNumber,
  idParamSchema,
  pagingQuery,
  positiveQuantity,
  quantity,
  ymdString,
} from '../../lib/zodHelpers.js';

const name = z
  .string({ error: 'Vui lòng nhập tên nguyên liệu' })
  .trim()
  .min(1, 'Vui lòng nhập tên nguyên liệu')
  .max(100, 'Tên nguyên liệu tối đa 100 ký tự');

const unit = z
  .string({ error: 'Vui lòng nhập đơn vị tính' })
  .trim()
  .min(1, 'Vui lòng nhập đơn vị tính')
  .max(20, 'Đơn vị tính tối đa 20 ký tự');

const categoryId = z
  .number({ error: 'Loại nguyên liệu không hợp lệ' })
  .int()
  .positive('Loại nguyên liệu không hợp lệ')
  .nullable();

const type = z.enum(IngredientType, { error: 'Kiểu nguyên liệu không hợp lệ' });

const shelfLifeHours = z
  .number({ error: 'Thời hạn sử dụng không hợp lệ' })
  .int('Thời hạn sử dụng phải là số giờ nguyên')
  .min(1, 'Thời hạn sử dụng tối thiểu 1 giờ')
  .max(8760, 'Thời hạn sử dụng tối đa 8760 giờ (1 năm)')
  .nullable();

const batchYield = positiveQuantity('Sản lượng một mẻ').nullable();

export const createIngredientSchema = z
  .object({
    name,
    unit,
    type: type.default(IngredientType.RAW),
    categoryId: categoryId.optional(),
    minStock: quantity('Ngưỡng cảnh báo').default(0),
    shelfLifeHours: shelfLifeHours.optional(),
    batchYield: batchYield.optional(),
  })
  .refine((v) => v.type !== IngredientType.PREPARED || v.shelfLifeHours != null, {
    path: ['shelfLifeHours'],
    message: 'Bán thành phẩm bắt buộc có thời hạn sử dụng',
  })
  .refine((v) => v.type === IngredientType.PREPARED || v.batchYield == null, {
    path: ['batchYield'],
    message: 'Chỉ bán thành phẩm mới có sản lượng mẻ',
  });

export const updateIngredientSchema = z
  .object({
    name: name.optional(),
    unit: unit.optional(),
    type: type.optional(),
    categoryId: categoryId.optional(),
    minStock: quantity('Ngưỡng cảnh báo').optional(),
    shelfLifeHours: shelfLifeHours.optional(),
    batchYield: batchYield.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const ingredientIdParamSchema = idParamSchema('nguyên liệu');

export const purchaseUnitParamSchema = z.object({
  id: z.coerce.number({ error: 'Mã nguyên liệu không hợp lệ' }).int().positive('Mã nguyên liệu không hợp lệ'),
  unitId: z.coerce.number({ error: 'Mã quy cách không hợp lệ' }).int().positive('Mã quy cách không hợp lệ'),
});

export const listIngredientsQuerySchema = z.object({
  q: z.string().trim().optional(),
  isActive: boolQuery.optional(),
  type: type.optional(),
  // Số id của loại, hoặc 'none' để lọc nguyên liệu chưa phân loại.
  categoryId: z
    .union([z.literal('none'), z.coerce.number().int().positive()], { error: 'Loại nguyên liệu không hợp lệ' })
    .optional(),
  ...pagingQuery,
});

const unitName = z
  .string({ error: 'Vui lòng nhập tên quy cách' })
  .trim()
  .min(1, 'Vui lòng nhập tên quy cách')
  .max(50, 'Tên quy cách tối đa 50 ký tự');
const factor = decimalNumber('Hệ số quy đổi', 3, 999_999_999).refine((v) => v > 0, 'Hệ số quy đổi phải lớn hơn 0');

export const createPurchaseUnitSchema = z.object({ name: unitName, factor });

export const updatePurchaseUnitSchema = z
  .object({
    name: unitName.optional(),
    factor: factor.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có thay đổi nào để cập nhật',
  });

export const prepRecipeSchema = z.object({
  batchYield: positiveQuantity('Sản lượng một mẻ'),
  items: z
    .array(
      z.object({
        ingredientId: z.number({ error: 'Nguyên liệu không hợp lệ' }).int().positive('Nguyên liệu không hợp lệ'),
        quantity: positiveQuantity('Định lượng'),
      }),
      { error: 'Danh sách nguyên liệu không hợp lệ' },
    )
    .min(1, 'Định mức phải có ít nhất một nguyên liệu')
    .max(50, 'Định mức tối đa 50 dòng')
    .refine((items) => new Set(items.map((i) => i.ingredientId)).size === items.length, {
      message: 'Một nguyên liệu chỉ được xuất hiện một lần trong định mức',
    }),
});

export const movementsQuerySchema = z.object({
  from: ymdString('Từ ngày').optional(),
  to: ymdString('Đến ngày').optional(),
  ...pagingQuery,
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type ListIngredientsQuery = z.infer<typeof listIngredientsQuerySchema>;
export type CreatePurchaseUnitInput = z.infer<typeof createPurchaseUnitSchema>;
export type UpdatePurchaseUnitInput = z.infer<typeof updatePurchaseUnitSchema>;
export type PrepRecipeInput = z.infer<typeof prepRecipeSchema>;
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;
