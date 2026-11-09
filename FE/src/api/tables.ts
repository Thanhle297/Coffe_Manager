import { api } from './client';

export type TableStatus = 'AVAILABLE' | 'SELECTING' | 'OCCUPIED';

export const tableStatusLabel: Record<TableStatus, string> = {
  AVAILABLE: 'Trống',
  SELECTING: 'Đang chọn món',
  OCCUPIED: 'Có khách',
};

export interface DiningTable {
  id: number;
  name: string;
  floor: number;
  seats: number | null;
  status: TableStatus;
  sortOrder: number;
  isActive: boolean;
  currentOrder: {
    id: number;
    code: string;
    createdAt: string;
    customerName: string | null;
    itemCount: number;
    subtotal: number;
  } | null;
}

export interface TableInput {
  name: string;
  floor?: number;
  seats?: number | null;
  sortOrder?: number;
}

export const floorLabel = (floor: number) => `Tầng ${floor}`;

/** Các tầng đang có bàn, tăng dần. */
export const floorsOf = (tables: { floor: number }[]) => [...new Set(tables.map((t) => t.floor))].sort((a, b) => a - b);

export const listTables = (includeInactive = false) =>
  api
    .get<DiningTable[]>('/tables', { params: includeInactive ? { includeInactive: true } : {} })
    .then((r) => r.data);

export const createTable = (input: TableInput) => api.post<DiningTable>('/tables', input).then((r) => r.data);

export const updateTable = (id: number, input: Partial<TableInput> & { isActive?: boolean }) =>
  api.patch<DiningTable>(`/tables/${id}`, input).then((r) => r.data);

export const deleteTable = (id: number) => api.delete(`/tables/${id}`).then(() => undefined);

export const setTableStatus = (id: number, status: 'AVAILABLE' | 'OCCUPIED') =>
  api.patch<DiningTable>(`/tables/${id}/status`, { status }).then((r) => r.data);
