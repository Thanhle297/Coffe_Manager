import { api } from './client';
import type { Account } from './auth';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type EmployeeStatus = 'WORKING' | 'RESIGNED';

export const genderLabel: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
export const employeeStatusLabel: Record<EmployeeStatus, string> = { WORKING: 'Đang làm', RESIGNED: 'Đã nghỉ' };
export const POSITIONS = ['Pha chế', 'Phục vụ', 'Thu ngân', 'Quản lý ca', 'Bảo vệ'];

export interface Employee {
  id: number;
  code: string;
  fullName: string;
  gender: Gender;
  position: string;
  phone: string | null;
  address: string | null;
  hireDate: string;
  status: EmployeeStatus;
  accountId: number | null;
  account: Account | null;
}

export interface EmployeeInput {
  fullName: string;
  gender: Gender;
  position: string;
  phone?: string | null;
  address?: string | null;
  hireDate: string;
  status?: EmployeeStatus;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Shift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  pay: number;
  isActive: boolean;
}

export interface ShiftInput {
  name: string;
  startTime: string;
  endTime: string;
  pay: number;
  isActive?: boolean;
}

export interface Attendance {
  id: number;
  employeeId: number;
  shiftId: number;
  workDate: string;
  payAmount: number;
  note: string | null;
  employee: { id: number; code: string; fullName: string };
  shift: { id: number; name: string; startTime: string; endTime: string };
}

export interface PayrollRow {
  id: number;
  code: string;
  fullName: string;
  position: string;
  status: EmployeeStatus;
  shiftCount: number;
  total: number;
}

export interface Payroll {
  month: string;
  items: PayrollRow[];
  totalShifts: number;
  total: number;
}

export interface EmployeePayroll {
  month: string;
  employee: Omit<PayrollRow, 'shiftCount' | 'total'>;
  items: Attendance[];
  shiftCount: number;
  total: number;
}

export const shiftTimeLabel = (s: Pick<Shift, 'startTime' | 'endTime'>) =>
  `${s.startTime} - ${s.endTime}${s.endTime < s.startTime ? ' (+1)' : ''}`;

// ---------- Nhân viên ----------

export const listEmployees = (params: {
  q?: string;
  status?: EmployeeStatus;
  position?: string;
  page?: number;
  pageSize?: number;
}) => api.get<Paged<Employee>>('/employees', { params }).then((r) => r.data);

export const createEmployee = (input: EmployeeInput) => api.post<Employee>('/employees', input).then((r) => r.data);

export const updateEmployee = (id: number, input: Partial<EmployeeInput>) =>
  api.put<Employee>(`/employees/${id}`, input).then((r) => r.data);

export const linkEmployeeAccount = (id: number, accountId: number | null) =>
  api.patch<Employee>(`/employees/${id}/account`, { accountId }).then((r) => r.data);

export const deleteEmployee = (id: number) =>
  api.delete<{ deleted: boolean }>(`/employees/${id}`).then((r) => r.data);

// ---------- Ca làm ----------

export const listShifts = (includeInactive = false) =>
  api.get<Shift[]>('/shifts', { params: includeInactive ? { includeInactive: true } : {} }).then((r) => r.data);

export const createShift = (input: ShiftInput) => api.post<Shift>('/shifts', input).then((r) => r.data);

export const updateShift = (id: number, input: Partial<ShiftInput>) =>
  api.put<Shift>(`/shifts/${id}`, input).then((r) => r.data);

export const deleteShift = (id: number) => api.delete<{ deleted: boolean }>(`/shifts/${id}`).then((r) => r.data);

// ---------- Chấm công, bảng lương ----------

export const listAttendances = (params: { from: string; to: string; employeeId?: number; shiftId?: number }) =>
  api.get<Attendance[]>('/attendances', { params }).then((r) => r.data);

export const createAttendances = (input: {
  workDate: string;
  entries: { employeeId: number; shiftId: number; note?: string | null }[];
}) => api.post<Attendance[]>('/attendances', input).then((r) => r.data);

export const deleteAttendance = (id: number) => api.delete(`/attendances/${id}`).then(() => undefined);

export const getPayroll = (month: string) => api.get<Payroll>('/payrolls', { params: { month } }).then((r) => r.data);

export const getEmployeePayroll = (employeeId: number, month: string) =>
  api.get<EmployeePayroll>(`/payrolls/${employeeId}`, { params: { month } }).then((r) => r.data);
