import { api } from './client';

export type Role = 'MANAGER' | 'STAFF';

export interface Account {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  account: Account;
}

export const roleLabel: Record<Role, string> = {
  MANAGER: 'Quản lý',
  STAFF: 'Nhân viên',
};

export const loginRequest = (username: string, password: string) =>
  api.post<AuthResult>('/auth/login', { username, password }).then((r) => r.data);

export const meRequest = () => api.get<Account>('/auth/me').then((r) => r.data);

export const changePasswordRequest = (oldPassword: string, newPassword: string) =>
  api.post<AuthResult>('/auth/change-password', { oldPassword, newPassword }).then((r) => r.data);
