import { createContext } from 'react';
import type { Account } from '../api/auth';

export interface AuthContextValue {
  user: Account | null;
  /** true khi đang khôi phục phiên từ token đã lưu. */
  loading: boolean;
  login: (username: string, password: string) => Promise<Account>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
