import type { LoyaltySetting, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { UpdateLoyaltyInput } from './loyalty.schema.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** Cấu hình luôn chỉ có một dòng (id = 1); tự tạo với giá trị mặc định nếu chưa có. */
export async function getSettings(db: Db = prisma): Promise<LoyaltySetting> {
  return db.loyaltySetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function updateSettings(actorId: number, input: UpdateLoyaltyInput) {
  return prisma.loyaltySetting.upsert({
    where: { id: 1 },
    update: { ...input, updatedById: actorId },
    create: { id: 1, ...input, updatedById: actorId },
  });
}

type Rates = Pick<LoyaltySetting, 'amountPerPoint' | 'pointValue' | 'maxRedeemPercent' | 'isEnabled'>;

/** Số điểm được cộng cho một hóa đơn có giá trị `amount` (đ). */
export function pointsFromAmount(settings: Rates, amount: number): number {
  if (!settings.isEnabled || amount <= 0) return 0;
  return Math.floor(amount / settings.amountPerPoint);
}

/** Số tiền (đ) giảm được khi dùng `points` điểm cho hóa đơn `orderTotal`, đã chặn theo mức tối đa. */
export function redeemValue(settings: Rates, points: number, orderTotal: number): number {
  if (!settings.isEnabled || points <= 0) return 0;
  const cap = Math.floor((orderTotal * settings.maxRedeemPercent) / 100);
  return Math.min(points * settings.pointValue, cap);
}
