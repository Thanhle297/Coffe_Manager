import { useContext } from 'react';
import { AuthContext } from './context';

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải được dùng bên trong AuthProvider');
  return value;
}
