import { api } from './client';

export type GroupBy = 'day' | 'month' | 'quarter' | 'year';
export interface Range {
  from: string;
  to: string;
}

export const groupByLabel: Record<GroupBy, string> = { day: 'Ngày', month: 'Tháng', quarter: 'Quý', year: 'Năm' };
export const methodLabel: Record<string, string> = { CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản' };
export const inSourceLabel: Record<string, string> = {
  OPENING: 'Tồn khai báo',
  STOCK_IN: 'Nhập hàng',
  PREP: 'Sơ chế',
  COUNT: 'Dư kiểm kê',
};
export const outReasonLabel: Record<string, string> = {
  SALE: 'Bán hàng',
  USAGE: 'Dùng nội bộ',
  DISCARD: 'Hủy',
  ADJUST: 'Điều chỉnh',
  PREP: 'Sơ chế',
};

export interface RevenueReport {
  series: { period: string; label: string; orders: number; subtotal: number; discount: number; total: number }[];
  byMethod: { method: string | null; orders: number; total: number }[];
  byCategory: { categoryId: number | null; name: string; quantity: number; revenue: number }[];
  summary: { orders: number; subtotal: number; discount: number; total: number; avgOrder: number };
}

export interface DrinkSoldRow {
  drinkId: number;
  drinkName: string;
  category: string;
  sizeId: number;
  sizeName: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface DrinksSoldReport {
  items: DrinkSoldRow[];
  toppings: { toppingId: number; name: string; quantity: number; revenue: number; cost: number }[];
  totalQuantity: number;
  totalRevenue: number;
}

export interface ProfitRow {
  period: string;
  label: string;
  orders: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  wastage: number;
  countSurplus: number;
  payroll: number;
  netProfit: number;
}

export interface ProfitReport {
  series: ProfitRow[];
  summary: Omit<ProfitRow, 'period' | 'label'> & {
    grossMargin: number;
    netMargin: number;
    wastageByReason: Record<string, number>;
  };
}

export interface StockMovementRow {
  ingredientId: number;
  name: string;
  unit: string;
  type: 'RAW' | 'PREPARED';
  category: string | null;
  opening: number;
  inQty: number;
  inBySource: Record<string, number>;
  inValue: number;
  outQty: number;
  outByReason: Record<string, number>;
  outValue: number;
  closing: number;
}

export interface StockMovementReport {
  items: StockMovementRow[];
  totalInValue: number;
  totalOutValue: number;
}

export interface StockLevelRow {
  ingredientId: number;
  name: string;
  unit: string;
  type: 'RAW' | 'PREPARED';
  category: string | null;
  quantity: number;
  minStock: number;
  avgCost: number;
  value: number;
  isLow: boolean;
}

export interface StockLevelReport {
  items: StockLevelRow[];
  expiringLots: {
    lotId: number;
    ingredientId: number;
    name: string;
    unit: string;
    remainingQty: number;
    value: number;
    expiresAt: string;
    expired: boolean;
  }[];
  byCategory: { name: string; value: number }[];
  summary: { totalValue: number; ingredientCount: number; lowCount: number };
}

export const getRevenueReport = (range: Range, groupBy: GroupBy) =>
  api.get<RevenueReport>('/reports/revenue', { params: { ...range, groupBy } }).then((r) => r.data);

export const getDrinksSoldReport = (range: Range) =>
  api.get<DrinksSoldReport>('/reports/drinks-sold', { params: range }).then((r) => r.data);

export const getProfitReport = (range: Range, groupBy: GroupBy) =>
  api.get<ProfitReport>('/reports/profit', { params: { ...range, groupBy } }).then((r) => r.data);

export const getStockMovementReport = (range: Range) =>
  api.get<StockMovementReport>('/reports/stock-movement', { params: range }).then((r) => r.data);

export const getStockLevelReport = () => api.get<StockLevelReport>('/reports/stock-level').then((r) => r.data);
