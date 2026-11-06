import { api } from './client';

export interface CustomerType {
  id: number;
  name: string;
  minPoints: number;
  discountPercent: number;
  customerCount?: number;
}

export interface Customer {
  id: number;
  fullName: string;
  phone: string;
  address: string | null;
  birthday: string | null; // YYYY-MM-DD
  points: number;
  lifetimePoints: number;
  customerType: CustomerType;
  createdAt: string;
}

export interface CustomerInput {
  fullName: string;
  phone: string;
  address?: string | null;
  birthday?: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type PointReason = 'EARN' | 'REDEEM' | 'ADJUST';

export interface PointLog {
  id: number;
  delta: number;
  reason: PointReason;
  note: string | null;
  orderId: number | null;
  createdAt: string;
}

export interface LoyaltySetting {
  amountPerPoint: number;
  pointValue: number;
  maxRedeemPercent: number;
  minRedeemPoints: number;
  isEnabled: boolean;
}

export interface CustomerListParams {
  q?: string;
  typeId?: number;
  page: number;
  pageSize: number;
}

export const listCustomers = (params: CustomerListParams) =>
  api.get<Paged<Customer>>('/customers', { params }).then((r) => r.data);

export const createCustomer = (input: CustomerInput) =>
  api.post<Customer>('/customers', input).then((r) => r.data);

export const updateCustomer = (id: number, input: Partial<CustomerInput>) =>
  api.patch<Customer>(`/customers/${id}`, input).then((r) => r.data);

export const deleteCustomer = (id: number) => api.delete(`/customers/${id}`).then(() => undefined);

export const getPointHistory = (id: number, page: number, pageSize = 10) =>
  api.get<Paged<PointLog>>(`/customers/${id}/points`, { params: { page, pageSize } }).then((r) => r.data);

export const adjustPoints = (id: number, input: { delta: number; note: string }) =>
  api.post<Customer>(`/customers/${id}/points/adjust`, input).then((r) => r.data);

export const listCustomerTypes = () => api.get<CustomerType[]>('/customer-types').then((r) => r.data);

export type CustomerTypeInput = Pick<CustomerType, 'name' | 'minPoints' | 'discountPercent'>;

export const createCustomerType = (input: CustomerTypeInput) =>
  api.post<CustomerType>('/customer-types', input).then((r) => r.data);

export const updateCustomerType = (id: number, input: Partial<CustomerTypeInput>) =>
  api.patch<CustomerType>(`/customer-types/${id}`, input).then((r) => r.data);

export const deleteCustomerType = (id: number) =>
  api.delete(`/customer-types/${id}`).then(() => undefined);

export const getLoyaltySettings = () => api.get<LoyaltySetting>('/loyalty-settings').then((r) => r.data);

export const updateLoyaltySettings = (input: Partial<LoyaltySetting>) =>
  api.patch<LoyaltySetting>('/loyalty-settings', input).then((r) => r.data);
