import { api } from './client';
import type { Paged } from './customers';

export type OrderStatus = 'OPEN' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'TRANSFER';

export const orderStatusLabel: Record<OrderStatus, string> = {
  OPEN: 'Đang mở',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
};

export const orderStatusColor: Record<OrderStatus, string> = {
  OPEN: 'gold',
  PAID: 'green',
  CANCELLED: 'default',
};

export const paymentLabel: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
};

export interface OrderItemTopping {
  id: number;
  toppingId: number;
  name: string;
  price: number;
  quantity: number;
  unitCost?: number;
}

export interface OrderItem {
  id: number;
  drinkId: number;
  sizeId: number;
  drinkName: string;
  sizeName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
  unitCost?: number;
  toppings: OrderItemTopping[];
}

export interface Order {
  id: number;
  code: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  pointsRedeemed: number;
  redeemAmount: number;
  total: number;
  pointsEarned: number;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  table: { id: number; name: string };
  staff: { id: number; fullName: string };
  customer: {
    id: number;
    fullName: string;
    phone: string;
    points: number;
    customerType: { id: number; name: string; discountPercent: number };
  } | null;
  items: OrderItem[];
  itemCount: number;
  costTotal?: number;
}

export interface OrderPreview {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  afterDiscount: number;
  pointsRedeemed: number;
  redeemAmount: number;
  total: number;
  pointsEarned: number;
  maxRedeemPoints: number;
  minRedeemPoints: number;
  loyaltyEnabled: boolean;
  customer: { id: number; fullName: string; phone: string; points: number; tierName: string } | null;
  shortages: { ingredientId: number; name: string; unit: string; required: number; available: number }[];
}

export interface OrderListRow {
  id: number;
  code: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  subtotal: number;
  total: number;
  createdAt: string;
  paidAt: string | null;
  itemCount: number;
  table: { id: number; name: string };
  staff: { id: number; fullName: string };
  customer: { id: number; fullName: string; phone: string } | null;
}

export interface OrderListParams {
  from?: string;
  to?: string;
  status?: OrderStatus;
  tableId?: number;
  staffId?: number;
  q?: string;
  page: number;
  pageSize: number;
}

export type OrderList = Paged<OrderListRow> & { summary: { paidCount: number; revenue: number } };

export interface AddItemInput {
  drinkId: number;
  sizeId: number;
  toppings: { toppingId: number; quantity: number }[];
  quantity: number;
  note: string | null;
}

const data = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export const listOrders = (params: OrderListParams) => data(api.get<OrderList>('/orders', { params }));
export const getOrder = (id: number) => data(api.get<Order>(`/orders/${id}`));
export const openOrder = (tableId: number) => data(api.post<Order>('/orders', { tableId }));
export const updateOrderNote = (id: number, note: string | null) => data(api.patch<Order>(`/orders/${id}`, { note }));
export const addOrderItem = (id: number, input: AddItemInput) => data(api.post<Order>(`/orders/${id}/items`, input));
export const updateOrderItem = (id: number, itemId: number, input: { quantity?: number; note?: string | null }) =>
  data(api.patch<Order>(`/orders/${id}/items/${itemId}`, input));
export const removeOrderItem = (id: number, itemId: number) => data(api.delete<Order>(`/orders/${id}/items/${itemId}`));
export const setOrderCustomer = (id: number, customerId: number | null) =>
  data(api.patch<Order>(`/orders/${id}/customer`, { customerId }));
export const previewOrder = (id: number, redeemPoints: number) =>
  data(api.get<OrderPreview>(`/orders/${id}/preview`, { params: { redeemPoints } }));
export const payOrder = (id: number, input: { paymentMethod: PaymentMethod; redeemPoints: number }) =>
  data(api.post<Order>(`/orders/${id}/pay`, input));
export const cancelOrder = (id: number) => data(api.post<Order>(`/orders/${id}/cancel`));
