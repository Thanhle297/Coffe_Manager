import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CoffeeOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  LockOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/useAuth';
import './login.css';

interface FormValues {
  username: string;
  password: string;
}

function getGreeting(hour: number) {
  if (hour < 11) return { text: 'Chào buổi sáng!', icon: '☀️', shift: 'SÁNG' };
  if (hour < 14) return { text: 'Chào buổi trưa!', icon: '🌤️', shift: 'TRƯA' };
  if (hour < 18) return { text: 'Chào buổi chiều!', icon: '☕', shift: 'CHIỀU' };
  return { text: 'Chào buổi tối!', icon: '🌙', shift: 'TỐI' };
}

function Bean({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 40 60" aria-hidden="true">
      <ellipse cx="20" cy="30" rx="16" ry="26" fill="currentColor" />
      <path d="M20 6 C8 22 32 38 20 54" fill="none" stroke="#faf6f1" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const today = now.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : from} replace />;

  const onFinish = async ({ username, password }: FormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const account = await login(username, password);
      navigate(account.mustChangePassword ? '/change-password' : from, { replace: true });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="login-brand">
          <span className="login-brand-mark">
            <CoffeeOutlined />
          </span>
          Coffee Manager
        </div>

        <div className="login-hero-body">
          <div className="login-hero-text">
            <h1>
              Vận hành quán cà phê <em>gọn gàng</em> như một ly espresso
            </h1>
            <p>Bán hàng, kho nguyên liệu và báo cáo doanh thu trong một nơi duy nhất.</p>
            <ul className="login-features">
              <li>
                <ShoppingCartOutlined /> Gọi món và thanh toán nhanh tại bàn
              </li>
              <li>
                <InboxOutlined /> Tự động trừ kho theo công thức đồ uống
              </li>
              <li>
                <BarChartOutlined /> Báo cáo doanh thu và lợi nhuận rõ ràng
              </li>
            </ul>
          </div>

          <svg className="login-cup" viewBox="0 0 200 230" aria-hidden="true">
            <g className="login-steam">
              <path d="M70 60 C60 45 80 35 70 20" />
              <path d="M100 62 C90 45 110 33 100 14" />
              <path d="M130 60 C120 45 140 35 130 20" />
            </g>
            <ellipse cx="100" cy="212" rx="86" ry="12" fill="#2f1f15" opacity="0.5" />
            <path d="M28 78 H162 V128 C162 168 138 192 95 192 C52 192 28 168 28 128 Z" fill="#f5ede4" />
            <path d="M162 94 H176 C196 94 196 142 170 146 L160 147" fill="none" stroke="#f5ede4" strokeWidth="12" strokeLinecap="round" />
            <ellipse cx="95" cy="78" rx="67" ry="14" fill="#d9c3ab" />
            <ellipse cx="95" cy="79" rx="58" ry="10" fill="#6f4e37" />
            <ellipse cx="95" cy="198" rx="62" ry="9" fill="#e6d9cc" />
          </svg>
        </div>

        <div className="login-footnote">Đồ án nhóm 31 · Hệ thống quản lý quán cà phê</div>
      </section>

      <section className="login-panel">
        <Bean className="login-bean b1" />
        <Bean className="login-bean b2" />
        <Bean className="login-bean b3" />

        <div className="login-greeting">
          <span className="login-greeting-icon">{greeting.icon}</span>
          <div>
            <strong>{greeting.text}</strong>
            <small>{today}</small>
          </div>
        </div>

        <div className="login-card">
          <header className="login-receipt-head">
            <span className="login-brand-mark">
              <CoffeeOutlined />
            </span>
            <b>COFFEE MANAGER</b>
            <small>PHIẾU ĐĂNG NHẬP · CA {greeting.shift}</small>
          </header>
          <div className="login-tear" />

          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              style={{ marginBottom: 16 }}
              closable={{ onClose: () => setError(null) }}
            />
          )}

          <Form<FormValues> layout="vertical" requiredMark={false} onFinish={onFinish} size="large">
            <Form.Item
              label="NHÂN VIÊN"
              name="username"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Tên đăng nhập"
                autoComplete="username"
                autoFocus
              />
            </Form.Item>
            <Form.Item
              label="MẬT KHẨU"
              name="password"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting} className="login-submit">
              Vào ca làm việc <ArrowRightOutlined />
            </Button>
          </Form>

          <div className="login-dash" />
          <p className="login-help">
            <InfoCircleOutlined />
            <span>Quên mật khẩu? Liên hệ Quản lý để được đặt lại.</span>
          </p>
          <p className="login-thanks">*** CẢM ƠN BẠN ĐÃ ĐỒNG HÀNH ***</p>
        </div>
      </section>
    </div>
  );
}
