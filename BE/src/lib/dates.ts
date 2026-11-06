const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Ngày hiện tại theo giờ Việt Nam dạng `YYYY-MM-DD`. */
export function todayVNString(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

/** Ngày hiện tại theo giờ Việt Nam, đặt ở 00:00 UTC để so sánh với cột `@db.Date`. */
export function todayVN(now = new Date()): Date {
  return new Date(`${todayVNString(now)}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Đầu ngày / cuối ngày theo giờ Việt Nam, dùng để lọc theo `createdAt`. */
export const startOfDayVN = (ymd: string) => new Date(`${ymd}T00:00:00.000+07:00`);
export const endOfDayVN = (ymd: string) => new Date(`${ymd}T23:59:59.999+07:00`);

export const toYmd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const addHours = (date: Date, hours: number): Date => new Date(date.getTime() + hours * 3_600_000);

/** Hạn ghi theo ngày (Date 00:00 UTC từ `dateString`) hiểu là 23:59:59 giờ VN của ngày đó. */
export const expiryFromDate = (d: Date): Date => new Date(`${d.toISOString().slice(0, 10)}T23:59:59.000+07:00`);
