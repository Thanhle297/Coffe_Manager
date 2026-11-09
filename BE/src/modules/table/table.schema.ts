import { z } from 'zod';
import { TableStatus } from '../../generated/prisma/enums.js';
import { boolQuery, idParamSchema } from '../../lib/zodHelpers.js';

const name = z
  .string({ error: 'Vui lòng nhập tên bàn' })
  .trim()
  .min(1, 'Vui lòng nhập tên bàn')
  .max(50, 'Tên bàn tối đa 50 ký tự');

const seats = z
  .number({ error: 'Số ghế không hợp lệ' })
  .int('Số ghế không hợp lệ')
  .min(1, 'Số ghế phải lớn hơn 0')
  .max(100, 'Số ghế tối đa 100')
  .nullable();

const floor = z
  .number({ error: 'Tầng không hợp lệ' })
  .int('Tầng không hợp lệ')
  .min(1, 'Tầng phải từ 1 trở lên')
  .max(50, 'Tầng tối đa 50');

const sortOrder = z.number({ error: 'Thứ tự không hợp lệ' }).int('Thứ tự không hợp lệ').min(0).max(100_000);

export const createTableSchema = z.object({
  name,
  floor: floor.optional(),
  seats: seats.optional(),
  sortOrder: sortOrder.optional(),
});

export const updateTableSchema = z
  .object({
    name: name.optional(),
    floor: floor.optional(),
    seats: seats.optional(),
    sortOrder: sortOrder.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào để cập nhật' });

/** Đổi tay chỉ giữa Trống và Có khách; SELECTING do đơn mở quyết định. */
export const tableStatusSchema = z.object({
  status: z.enum([TableStatus.AVAILABLE, TableStatus.OCCUPIED], { error: 'Trạng thái bàn không hợp lệ' }),
});

export const tableIdParamSchema = idParamSchema('bàn');

export const listTablesQuerySchema = z.object({
  includeInactive: boolQuery.optional(),
  floor: z.coerce.number({ error: 'Tầng không hợp lệ' }).int().min(1).optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type ListTablesQuery = z.infer<typeof listTablesQuerySchema>;
