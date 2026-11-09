import { z } from 'zod';
import { ymdString } from '../../lib/zodHelpers.js';

const MAX_DAYS = 2 * 366;

const range = z
  .object({ from: ymdString('Từ ngày'), to: ymdString('Đến ngày') })
  .refine((v) => v.from <= v.to, { message: 'Từ ngày phải trước đến ngày', path: ['to'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= MAX_DAYS, {
    message: 'Khoảng thời gian tối đa 2 năm',
    path: ['to'],
  });

export const GROUP_BY = ['day', 'month', 'quarter', 'year'] as const;

export const rangeQuerySchema = range;

export const groupedRangeQuerySchema = z
  .object({
    from: ymdString('Từ ngày'),
    to: ymdString('Đến ngày'),
    groupBy: z.enum(GROUP_BY, { error: 'Kiểu nhóm phải là day, month, quarter hoặc year' }).default('day'),
  })
  .refine((v) => v.from <= v.to, { message: 'Từ ngày phải trước đến ngày', path: ['to'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= MAX_DAYS, {
    message: 'Khoảng thời gian tối đa 2 năm',
    path: ['to'],
  });

export type GroupBy = (typeof GROUP_BY)[number];
export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type GroupedRangeQuery = z.infer<typeof groupedRangeQuerySchema>;
