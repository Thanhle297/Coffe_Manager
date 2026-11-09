import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dropdown, Flex, Layout, Menu, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  DollarOutlined,
  IdcardOutlined,
  TagsOutlined,
  PlusSquareOutlined,
  AuditOutlined,
  CoffeeOutlined,
  FireOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ExportOutlined,
  ImportOutlined,
  ShopOutlined,
  GiftOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ContactsOutlined,
  ShoppingCartOutlined,
  TableOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { getLowStock } from '../api/inventory';
import { roleLabel, type Role } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { colors } from '../theme';

const { Sider, Header, Content } = Layout;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
  children?: Omit<NavItem, 'children'>[];
}

const navItems: NavItem[] = [
  { key: '/', label: 'Trang chủ', icon: <HomeOutlined /> },
  {
    key: 'sales',
    label: 'Bán hàng',
    icon: <ShoppingCartOutlined />,
    children: [
      { key: '/tables', label: 'Sơ đồ bàn', icon: <TableOutlined /> },
      { key: '/orders', label: 'Hóa đơn', icon: <FileTextOutlined /> },
      { key: '/tables/manage', label: 'Quản lý bàn', icon: <SettingOutlined />, roles: ['MANAGER'] },
    ],
  },
  { key: '/customers', label: 'Khách hàng', icon: <ContactsOutlined /> },
  {
    key: 'menu',
    label: 'Thực đơn',
    icon: <BookOutlined />,
    children: [
      { key: '/drinks', label: 'Đồ uống', icon: <CoffeeOutlined /> },
      { key: '/toppings', label: 'Topping', icon: <PlusSquareOutlined /> },
      { key: '/drink-categories', label: 'Danh mục', icon: <TagsOutlined /> },
    ],
  },
  {
    key: 'inventory',
    label: 'Kho',
    icon: <DatabaseOutlined />,
    children: [
      { key: '/ingredients', label: 'Nguyên liệu', icon: <ExperimentOutlined /> },
      { key: '/ingredient-categories', label: 'Loại nguyên liệu', icon: <AppstoreOutlined /> },
      { key: '/suppliers', label: 'Nhà cung cấp', icon: <ShopOutlined /> },
      { key: '/prep', label: 'Sơ chế', icon: <FireOutlined /> },
      { key: '/stock-in', label: 'Phiếu nhập', icon: <ImportOutlined /> },
      { key: '/stock-out', label: 'Phiếu xuất', icon: <ExportOutlined /> },
      { key: '/stock-counts', label: 'Kiểm kê', icon: <AuditOutlined /> },
    ],
  },
  {
    key: 'staff',
    label: 'Nhân sự',
    icon: <IdcardOutlined />,
    roles: ['MANAGER'],
    children: [
      { key: '/employees', label: 'Nhân viên', icon: <IdcardOutlined /> },
      { key: '/shifts', label: 'Ca làm việc', icon: <ClockCircleOutlined /> },
      { key: '/attendances', label: 'Chấm công', icon: <CalendarOutlined /> },
      { key: '/payrolls', label: 'Bảng lương', icon: <DollarOutlined /> },
    ],
  },
  { key: '/reports', label: 'Báo cáo', icon: <BarChartOutlined />, roles: ['MANAGER'] },
  { key: '/loyalty', label: 'Ưu đãi khách hàng', icon: <GiftOutlined />, roles: ['MANAGER'] },
  { key: '/accounts', label: 'Tài khoản', icon: <TeamOutlined />, roles: ['MANAGER'] },
];

const pageTitles: Record<string, string> = {
  '/': 'Trang chủ',
  '/tables': 'Sơ đồ bàn',
  '/tables/manage': 'Quản lý bàn',
  '/orders': 'Hóa đơn',
  '/customers': 'Khách hàng',
  '/drinks': 'Đồ uống',
  '/toppings': 'Topping',
  '/drink-categories': 'Danh mục đồ uống',
  '/ingredients': 'Nguyên liệu',
  '/ingredient-categories': 'Loại nguyên liệu',
  '/suppliers': 'Nhà cung cấp',
  '/stock-in': 'Phiếu nhập kho',
  '/stock-out': 'Phiếu xuất kho',
  '/prep': 'Sơ chế',
  '/stock-counts': 'Kiểm kê kho',
  '/loyalty': 'Ưu đãi khách hàng',
  '/accounts': 'Quản lý tài khoản',
  '/change-password': 'Đổi mật khẩu',
};

// Hai sắc nâu/be khác nhau cho từng vai trò, chữ tương phản rõ.
const roleTagStyle: Record<Role, React.CSSProperties> = {
  MANAGER: { background: colors.brown, color: '#FFFFFF', borderColor: colors.brown },
  STAFF: { background: colors.latte, color: colors.espresso, borderColor: colors.caramel },
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const { data: lowStock } = useQuery({
    queryKey: ['ingredients', 'low-stock'],
    queryFn: getLowStock,
    enabled: !!user && !user.mustChangePassword,
    refetchInterval: 60_000,
  });
  const warningCount = lowStock?.length ?? 0;

  // Badge đứng cạnh nhãn (không bọc nhãn) để nhãn giữ màu chữ của menu.
  const withBadge = (label: string) => (
    <span>
      {label}
      <Badge count={warningCount} size="small" style={{ marginInlineStart: 8 }} />
    </span>
  );

  if (!user) return null;

  // Ẩn mục theo vai trò; khi bắt buộc đổi mật khẩu thì không hiện mục nào.
  const menuItems: MenuProps['items'] = user.mustChangePassword
    ? []
    : navItems
        .filter((item) => !item.roles || item.roles.includes(user.role))
        .map(({ key, label, icon, children }) => ({
          key,
          icon,
          label: key === 'inventory' ? withBadge(label) : label,
          children: children
            ?.filter((c) => !c.roles || c.roles.includes(user.role))
            .map((c) => ({
            key: c.key,
            icon: c.icon,
            label: c.key === '/ingredients' ? withBadge(c.label) : c.label,
          })),
        }));

  const userMenu: MenuProps['items'] = [
    { key: 'account', label: 'Tài khoản', icon: <UserOutlined /> },
    { type: 'divider' },
    { key: 'logout', label: 'Đăng xuất', icon: <LogoutOutlined />, danger: true },
  ];

  const onUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') logout();
    else navigate('/change-password');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsible
        trigger={null}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={232}
        className="app-sider"
        style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}
      >
        <Flex
          align="center"
          gap={10}
          justify={collapsed ? 'center' : 'flex-start'}
          style={{
            height: 64,
            padding: collapsed ? 0 : '0 24px',
            color: '#fff',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              width: 36,
              height: 36,
              borderRadius: 10,
              fontSize: 18,
              color: colors.espresso,
              background: 'linear-gradient(135deg, #F5EDE4, #D9C3AB)',
            }}
          >
            <CoffeeOutlined />
          </span>
          {!collapsed && (
            <Typography.Text
              strong
              style={{ color: '#fff', fontSize: 15, letterSpacing: 1.5, whiteSpace: 'nowrap' }}
            >
              COFFEE MANAGER
            </Typography.Text>
          )}
        </Flex>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={['sales', 'inventory']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: `1px solid ${colors.latte}`,
          }}
        >
          <Flex align="center" gap={12}>
            <Button
              type="text"
              aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 18, color: colors.brown }}
            />
            <Typography.Text strong style={{ fontSize: 18, color: colors.espresso }}>
              {pageTitles[pathname] ?? (pathname.startsWith('/orders/') ? 'Gọi món' : '')}
            </Typography.Text>
          </Flex>
          <Dropdown menu={{ items: userMenu, onClick: onUserMenuClick }} trigger={['click']}>
            <Flex align="center" gap={10} style={{ cursor: 'pointer' }}>
              <Avatar style={{ background: colors.brown }}>
                {user.fullName.charAt(0).toUpperCase()}
              </Avatar>
              <Flex vertical style={{ lineHeight: 1.25 }}>
                <Typography.Text strong>{user.fullName}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  @{user.username}
                </Typography.Text>
              </Flex>
              <Tag style={{ marginInlineEnd: 0, fontWeight: 500, ...roleTagStyle[user.role] }}>
                {roleLabel[user.role]}
              </Tag>
            </Flex>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
