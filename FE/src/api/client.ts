import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// AuthProvider đăng ký hàm này để đăng xuất tập trung khi server trả 401.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      // 401 ở /auth/login nghĩa là sai thông tin đăng nhập, không phải hết phiên.
      !error.config?.url?.includes('/auth/login') &&
      localStorage.getItem('token')
    ) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại'): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Không kết nối được máy chủ';
    const message = (error.response.data as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return fallback;
}

/** Tải hết mọi trang của một API phân trang (API giới hạn tối đa 100 dòng mỗi trang). */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<{ items: T[]; total: number }>) {
  const first = await fetchPage(1);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page++) {
    const next = await fetchPage(page);
    if (next.items.length === 0) break;
    items.push(...next.items);
  }
  return items;
}
