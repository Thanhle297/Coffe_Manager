import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { changePasswordRequest, loginRequest, meRequest, type Account } from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import { AuthContext, type AuthContextValue } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(() => localStorage.getItem('token') !== null);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Khôi phục phiên khi tải lại trang.
  useEffect(() => {
    if (localStorage.getItem('token') === null) return;
    let cancelled = false;
    meRequest()
      .then((account) => !cancelled && setUser(account))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback<AuthContextValue['login']>(async (username, password) => {
    const { token, account } = await loginRequest(username, password);
    localStorage.setItem('token', token);
    setUser(account);
    return account;
  }, []);

  const changePassword = useCallback<AuthContextValue['changePassword']>(
    async (oldPassword, newPassword) => {
      // Server tăng tokenVersion nên phải thay bằng token mới ngay.
      const { token, account } = await changePasswordRequest(oldPassword, newPassword);
      localStorage.setItem('token', token);
      setUser(account);
    },
    [],
  );

  const value = useMemo(
    () => ({ user, loading, login, changePassword, logout }),
    [user, loading, login, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
