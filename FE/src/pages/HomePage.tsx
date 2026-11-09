import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, Tag } from 'antd';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertOutlined,
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CoffeeOutlined,
  ContactsOutlined,
  ExportOutlined,
  ImportOutlined,
  InboxOutlined,
  KeyOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { roleLabel, type Role } from '../api/auth';
import { listCustomers } from '../api/customers';
import {
  getLowStock,
  listIngredients,
  listStockIns,
  listStockOuts,
  stockOutReasonLabel,
  type LowStockReason,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import { colors } from '../theme';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtRemaining, ymdLocal } from '../utils/format';
import './dashboard.css';

interface Shortcut {
  title: string;
  icon: React.ReactNode;
  path?: string; // chưa có path = chưa triển khai
  roles?: Role[];
}

const shortcuts: Shortcut[] = [
  { title: 'Nhập kho', icon: <ImportOutlined />, path: '/stock-in' },
  { title: 'Xuất kho', icon: <ExportOutlined />, path: '/stock-out' },
  { title: 'Nguyên liệu', icon: <InboxOutlined />, path: '/ingredients' },
  { title: 'Khách hàng', icon: <ContactsOutlined />, path: '/customers' },
  { title: 'Tài khoản', icon: <TeamOutlined />, path: '/accounts', roles: ['MANAGER'] },
  { title: 'Đơn hàng', icon: <ShoppingCartOutlined /> },
  { title: 'Đồ uống', icon: <CoffeeOutlined /> },
  { title: 'Nhân viên', icon: <UserSwitchOutlined />, roles: ['MANAGER'] },
  { title: 'Báo cáo', icon: <BarChartOutlined />, path: '/reports', roles: ['MANAGER'] },
];

const reasonTag: Record<LowStockReason, { text: string; color: string }> = {
  EXPIRED: { text: 'Hết hạn', color: 'error' },
  EXPIRING: { text: 'Sắp hết hạn', color: 'warning' },
  LOW: { text: 'Dưới mức tối thiểu', color: 'orange' },
};

function getGreeting(hour: number) {
  if (hour < 11) return { text: 'Chào buổi sáng', shift: 'SÁNG' };
  if (hour < 14) return { text: 'Chào buổi trưa', shift: 'TRƯA' };
  if (hour < 18) return { text: 'Chào buổi chiều', shift: 'CHIỀU' };
  return { text: 'Chào buổi tối', shift: 'TỐI' };
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** 7 ngày gần nhất (cũ → mới), kèm nhãn "T2 03/11". */
function lastDays(n: number) {
  const out: { ymd: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      ymd: ymdLocal(d),
      label: `${WEEKDAY[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return out;
}

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'default' | 'warn' | 'ok';
  loading: boolean;
  onClick?: () => void;
}

function Stat({ label, value, hint, icon, tone = 'default', loading, onClick }: StatProps) {
  return (
    <button type="button" className={`dash-stat tone-${tone}`} onClick={onClick} disabled={!onClick}>
      <span className="dash-stat-icon">{icon}</span>
      <span className="dash-stat-body">
        <span className="dash-stat-label">{label}</span>
        {loading ? <Skeleton.Input active size="small" style={{ width: 90 }} /> : <strong>{value}</strong>}
        {hint && !loading && <span className="dash-stat-hint">{hint}</span>}
      </span>
    </button>
  );
}

function Panel({
  title,
  extra,
  children,
  className = '',
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-panel ${className}`}>
      <header>
        <h3>{title}</h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const days = useMemo(() => lastDays(7), []);
  const from = days[0].ymd;
  const to = days[days.length - 1].ymd;

  const ingredients = useQuery({
    queryKey: ['dash', 'ingredients'],
    queryFn: () => listIngredients({ isActive: true, page: 1, pageSize: 1 }),
  });
  const lowStock = useQuery({ queryKey: ['dash', 'low-stock'], queryFn: getLowStock });
  const customers = useQuery({
    queryKey: ['dash', 'customers'],
    queryFn: () => listCustomers({ page: 1, pageSize: 1 }),
  });
  const stockIns = useQuery({
    queryKey: ['dash', 'stock-in', from, to],
    queryFn: () => listStockIns({ from, to, page: 1, pageSize: 100 }),
  });
  const stockOuts = useQuery({
    queryKey: ['dash', 'stock-out', from, to],
    queryFn: () => listStockOuts({ from, to, page: 1, pageSize: 100 }),
  });

  const chart = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of stockIns.data?.items ?? []) byDay.set(s.importDate, (byDay.get(s.importDate) ?? 0) + s.total);
    return days.map((d) => ({ label: d.label, total: byDay.get(d.ymd) ?? 0 }));
  }, [days, stockIns.data]);

  if (!user) return null;

  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const today = now.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const visible = shortcuts.filter((s) => !s.roles || s.roles.includes(user.role));

  const spend7d = stockIns.data?.items.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const lowCount = lowStock.data?.length ?? 0;
  const recentIns = stockIns.data?.items.slice(0, 5) ?? [];
  const recentOuts = stockOuts.data?.items.slice(0, 5) ?? [];
  const alerts = (lowStock.data ?? []).slice(0, 6);

  return (
    <div className="dash">
      <section className="dash-banner">
        <div>
          <span className="dash-date">{today}</span>
          <h1>
            {greeting.text}, <em>{user.fullName}</em>
          </h1>
          <p>Tổng quan hoạt động cửa hàng hôm nay.</p>
        </div>
        <aside className="dash-ticket">
          <b>PHIẾU CA LÀM</b>
          <div className="dash-ticket-row">
            <span>Nhân viên</span>
            <strong>@{user.username}</strong>
          </div>
          <div className="dash-ticket-row">
            <span>Vai trò</span>
            <strong>{roleLabel[user.role]}</strong>
          </div>
          <div className="dash-ticket-row">
            <span>Ca</span>
            <strong>{greeting.shift}</strong>
          </div>
          <button type="button" className="dash-ticket-btn" onClick={() => navigate('/change-password')}>
            <KeyOutlined /> Đổi mật khẩu
          </button>
        </aside>
      </section>

      <div className="dash-stats">
        <Stat
          label="Nguyên liệu đang dùng"
          value={fmtNum(ingredients.data?.total)}
          icon={<InboxOutlined />}
          loading={ingredients.isLoading}
          onClick={() => navigate('/ingredients')}
        />
        <Stat
          label="Cần chú ý"
          value={fmtNum(lowCount)}
          hint={lowCount === 0 ? 'Kho ổn định' : 'Sắp hết hoặc sắp hết hạn'}
          icon={lowCount === 0 ? <CheckCircleOutlined /> : <AlertOutlined />}
          tone={lowCount === 0 ? 'ok' : 'warn'}
          loading={lowStock.isLoading}
          onClick={() => navigate('/ingredients')}
        />
        <Stat
          label="Chi nhập kho 7 ngày"
          value={fmtMoney(spend7d)}
          hint={`${fmtNum(stockIns.data?.total ?? 0)} phiếu nhập`}
          icon={<ImportOutlined />}
          loading={stockIns.isLoading}
          onClick={() => navigate('/stock-in')}
        />
        <Stat
          label="Khách hàng"
          value={fmtNum(customers.data?.total)}
          icon={<ContactsOutlined />}
          loading={customers.isLoading}
          onClick={() => navigate('/customers')}
        />
      </div>

      <div className="dash-cols">
        <Panel title="Chi nhập kho 7 ngày qua" className="span-main">
          {stockIns.isLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : (
            <div className="dash-chart" role="img" aria-label="Biểu đồ chi nhập kho theo ngày">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={colors.latte} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.muted }} tickLine={false} axisLine={false} />
                  <YAxis
                    width={56}
                    tick={{ fontSize: 12, fill: colors.muted }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => (v >= 1_000_000 ? `${v / 1_000_000}tr` : v >= 1000 ? `${v / 1000}k` : String(v))}
                  />
                  <Tooltip
                    cursor={{ fill: colors.foam }}
                    formatter={(v) => [fmtMoney(Number(v)), 'Chi nhập']}
                    contentStyle={{ borderRadius: 8, border: `1px solid ${colors.latte}` }}
                  />
                  <Bar dataKey="total" fill={colors.brown} radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Cảnh báo kho"
          className="span-side"
          extra={
            lowCount > alerts.length && (
              <button type="button" className="dash-link" onClick={() => navigate('/ingredients')}>
                Xem tất cả ({lowCount}) <ArrowRightOutlined />
              </button>
            )
          }
        >
          {lowStock.isLoading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : alerts.length === 0 ? (
            <p className="dash-empty">
              <CheckCircleOutlined /> Không có nguyên liệu nào cần chú ý.
            </p>
          ) : (
            <ul className="dash-list">
              {alerts.map((i) => (
                <li key={i.id}>
                  <span className="dash-list-main">
                    <b>
                      {i.category?.icon ?? '📦'} {i.name}
                    </b>
                    <small>
                      Còn {fmtNum(i.quantity)} {i.unit}
                      {i.reasons.includes('LOW') && ` / tối thiểu ${fmtNum(i.minStock)}`}
                      {i.nextExpiresAt && !i.reasons.includes('LOW') && ` · ${fmtRemaining(i.nextExpiresAt)}`}
                    </small>
                  </span>
                  <span className="dash-tags">
                    {i.reasons.map((r) => (
                      <Tag key={r} color={reasonTag[r].color} bordered={false}>
                        {reasonTag[r].text}
                      </Tag>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Phiếu nhập gần đây"
          className="span-half"
          extra={
            <button type="button" className="dash-link" onClick={() => navigate('/stock-in')}>
              Mở <ArrowRightOutlined />
            </button>
          }
        >
          {stockIns.isLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : recentIns.length === 0 ? (
            <p className="dash-empty">Chưa có phiếu nhập trong 7 ngày qua.</p>
          ) : (
            <ul className="dash-list">
              {recentIns.map((s) => (
                <li key={s.id}>
                  <span className="dash-list-main">
                    <b>{s.code}</b>
                    <small>
                      {s.supplier.name} · {fmtDate(s.importDate)}
                    </small>
                  </span>
                  <strong className="dash-amount">{fmtMoney(s.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Phiếu xuất gần đây"
          className="span-half"
          extra={
            <button type="button" className="dash-link" onClick={() => navigate('/stock-out')}>
              Mở <ArrowRightOutlined />
            </button>
          }
        >
          {stockOuts.isLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : recentOuts.length === 0 ? (
            <p className="dash-empty">Chưa có phiếu xuất trong 7 ngày qua.</p>
          ) : (
            <ul className="dash-list">
              {recentOuts.map((s) => (
                <li key={s.id}>
                  <span className="dash-list-main">
                    <b>{s.code}</b>
                    <small>
                      {s.createdBy?.fullName ?? 'Hệ thống'} · {fmtDateTime(s.createdAt)}
                    </small>
                  </span>
                  <Tag bordered={false}>{stockOutReasonLabel[s.reason]}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <h2 className="dash-section">
        <span>Lối tắt</span>
        <small>Mục chưa có liên kết đang được phát triển</small>
      </h2>
      <div className="dash-shortcuts">
        {visible.map((s) => {
          const ready = Boolean(s.path);
          return (
            <button
              key={s.title}
              type="button"
              className={`dash-shortcut${ready ? '' : ' is-soon'}`}
              aria-disabled={!ready}
              onClick={() => s.path && navigate(s.path)}
            >
              <span className="dash-shortcut-icon">{s.icon}</span>
              <span>{s.title}</span>
              {!ready && <small>Sắp ra mắt</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
