export const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 3 });

/** Tiền làm tròn đến đồng (Q16). */
export const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n).toLocaleString('vi-VN')} ₫`;

/** Đơn giá theo đơn vị gốc: giữ tối đa 2 chữ số lẻ để thấy được giá nhỏ như 94,92 đ/ml. */
export const fmtUnitPrice = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ₫`;

export const fmtDateTime = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** "còn 3 giờ", "còn 5 ngày", "hết hạn 2 giờ trước". */
export function fmtRemaining(expiresAt: string | null | undefined, now = Date.now()): string {
  if (!expiresAt) return 'Không có hạn';
  const ms = new Date(expiresAt).getTime() - now;
  const abs = Math.abs(ms);
  const hours = abs / 3_600_000;
  const text =
    hours < 1 ? `${Math.max(1, Math.round(abs / 60_000))} phút` : hours < 48 ? `${Math.floor(hours)} giờ` : `${Math.floor(hours / 24)} ngày`;
  return ms > 0 ? `còn ${text}` : `hết hạn ${text} trước`;
}

/** Ngưỡng sắp hết hạn (Q4), khớp với BE: thô 7 ngày, bán thành phẩm 2 giờ. */
export const EXPIRING_HOURS = { RAW: 7 * 24, PREPARED: 2 } as const;

export type ExpiryState = 'OK' | 'EXPIRING' | 'EXPIRED' | 'NONE';

export function expiryState(expiresAt: string | null | undefined, type: 'RAW' | 'PREPARED', now = Date.now()): ExpiryState {
  if (!expiresAt) return 'NONE';
  const t = new Date(expiresAt).getTime();
  if (t <= now) return 'EXPIRED';
  return t <= now + EXPIRING_HOURS[type] * 3_600_000 ? 'EXPIRING' : 'OK';
}

/** Chuỗi ngày theo giờ máy, dạng YYYY-MM-DD. */
export const ymdLocal = (d: Date) => d.toLocaleDateString('en-CA');

/**
 * Quy đổi lượng theo đơn vị gốc ra quy cách mua, lấy quy cách lớn trước.
 * Ví dụ 23.400 ml với [Thùng 12 hộp = 12000, Hộp 1 L = 1000] → "1 Thùng 12 hộp + 11 Hộp 1 L + 400 ml".
 * Trả chuỗi rỗng nếu không có quy cách hoặc lượng nhỏ hơn quy cách nhỏ nhất.
 */
export function fmtPacks(qty: number, unit: string, units: { name: string; factor: number }[]): string {
  if (units.length === 0 || qty <= 0) return '';
  const sorted = [...units].sort((a, b) => b.factor - a.factor);
  if (qty < sorted[sorted.length - 1].factor) return '';
  let rest = qty;
  const parts: string[] = [];
  for (const u of sorted) {
    const n = Math.floor(rest / u.factor + 1e-9);
    if (n > 0) {
      parts.push(`${n} ${u.name}`);
      rest = Math.round((rest - n * u.factor) * 1000) / 1000;
    }
  }
  if (rest > 0) parts.push(`${fmtNum(rest)} ${unit}`);
  return parts.join(' + ');
}
