import { z } from 'zod';
import { dateString, idParamSchema, optionalText, ymdString } from '../../lib/zodHelpers.js';

const id = (label: string) => z.number({ error: `${label} không hợp lệ` }).int().positive(`${label} không hợp lệ`);

export const attendanceBatchSchema = z.object({
  workDate: dateString('Ngày làm'),
  entries: z
    .array(
      z.object({
        employeeId: id('Nhân viên'),
        shiftId: id('Ca làm'),
        note: optionalText('Ghi chú', 255).optional(),
      }),
      { error: 'Danh sách chấm công không hợp lệ' },
    )
    .min(1, 'Chọn ít nhất một nhân viên và ca')
    .max(500, 'Tối đa 500 dòng mỗi lần')
    .refine(
      (list) => new Set(list.map((e) => `${e.employeeId}:${e.shiftId}`)).size === list.length,
      'Có nhân viên bị chấm trùng ca trong cùng lần lưu',
    ),
});

export const attendanceIdParamSchema = idParamSchema('chấm công');

export const listAttendancesQuerySchema = z
  .object({
    from: ymdString('Từ ngày'),
    to: ymdString('Đến ngày'),
    employeeId: z.coerce.number().int().positive().optional(),
    shiftId: z.coerce.number().int().positive().optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'Từ ngày phải trước đến ngày', path: ['to'] });

const month = z
  .string({ error: 'Vui lòng chọn tháng' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng phải có dạng YYYY-MM');

export const payrollQuerySchema = z.object({ month });

export const payrollEmployeeParamSchema = z.object({
  employeeId: z.coerce.number({ error: 'Mã nhân viên không hợp lệ' }).int().positive('Mã nhân viên không hợp lệ'),
});

export type AttendanceBatchInput = z.infer<typeof attendanceBatchSchema>;
export type ListAttendancesQuery = z.infer<typeof listAttendancesQuerySchema>;
export type PayrollQuery = z.infer<typeof payrollQuerySchema>;
