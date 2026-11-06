import { api } from './client';
import type { Account, Role } from './auth';

export interface CreateAccountInput {
  username: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface UpdateAccountInput {
  role?: Role;
  isActive?: boolean;
}

export const listAccounts = () => api.get<Account[]>('/accounts').then((r) => r.data);

export const createAccount = (input: CreateAccountInput) =>
  api.post<Account>('/accounts', input).then((r) => r.data);

export const updateAccount = (id: number, input: UpdateAccountInput) =>
  api.patch<Account>(`/accounts/${id}`, input).then((r) => r.data);

export const resetAccountPassword = (id: number) =>
  api.post<{ temporaryPassword: string }>(`/accounts/${id}/reset-password`).then((r) => r.data);
