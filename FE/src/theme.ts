import type { ThemeConfig } from 'antd';

// Bảng màu nâu cà phê – trắng kem làm chủ đạo.
export const colors = {
  espresso: '#3E2A1E',
  roast: '#4B3426',
  brown: '#6F4E37',
  caramel: '#A47551',
  latte: '#E6D9CC',
  cream: '#FAF6F1',
  foam: '#F5EDE4',
  // Màu chữ phụ và trạng thái, đều đạt tương phản >= 4.5:1 trên nền trắng.
  muted: '#6B5A4C',
  up: '#2F7D32',
  down: '#C4301C',
  warn: '#B4380A',
};

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.brown,
    colorInfo: colors.brown,
    colorLink: colors.brown,
    colorTextBase: colors.espresso,
    colorBgLayout: colors.cream,
    colorBgContainer: '#FFFFFF',
    colorBorder: colors.latte,
    colorBorderSecondary: colors.foam,
    colorTextSecondary: '#5C4A3D',
    colorTextDescription: colors.muted,
    colorTextPlaceholder: '#85756A',
    colorTextDisabled: '#A89A8D',
    colorSuccess: colors.up,
    colorError: colors.down,
    borderRadius: 8,
    fontFamily:
      "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: {
      siderBg: colors.espresso,
      headerBg: '#FFFFFF',
      bodyBg: colors.cream,
    },
    Menu: {
      darkItemBg: colors.espresso,
      darkSubMenuItemBg: colors.espresso,
      darkItemColor: '#E9DCCF',
      darkItemHoverBg: colors.roast,
      darkItemHoverColor: '#FFFFFF',
      darkItemSelectedBg: colors.brown,
      darkItemSelectedColor: '#FFFFFF',
    },
    Table: { headerBg: colors.foam, headerColor: colors.espresso, rowHoverBg: colors.cream },
    Button: { primaryShadow: 'none' },
  },
};
