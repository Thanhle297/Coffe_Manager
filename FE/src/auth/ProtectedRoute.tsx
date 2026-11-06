import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Flex, Spin } from 'antd';
import type { Role } from '../api/auth';
import { useAuth } from './useAuth';

interface Props {
  /** Chỉ cho các vai trò này vào; bỏ trống = mọi tài khoản đã đăng nhập. */
  roles?: Role[];
}

export function ProtectedRoute({ roles }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
