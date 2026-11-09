/**
 * Tính tiền một đơn: dùng chung cho xem trước và thanh toán để hai bên luôn khớp.
 */
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { getSettings, pointsFromAmount, redeemValue } from '../loyalty/loyalty.service.js';

type Tx = Prisma.TransactionClient;

export type Totals = {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  afterDiscount: number;
  pointsRedeemed: number;
  redeemAmount: number;
  total: number;
  /** Điểm sẽ được cộng (Q8: tính trên tổng thực trả). */
  pointsEarned: number;
  /** Số điểm tối đa được dùng cho đơn này (Q14). */
  maxRedeemPoints: number;
  minRedeemPoints: number;
  loyaltyEnabled: boolean;
  customer: { id: number; fullName: string; phone: string; points: number; tierName: string } | null;
};

export async function computeTotals(
  tx: Tx,
  order: { customerId: number | null; items: { quantity: number; unitPrice: number }[] },
  redeemPoints: number,
): Promise<Totals> {
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const customer = order.customerId
    ? await tx.customer.findUnique({ where: { id: order.customerId }, include: { customerType: true } })
    : null;
  const settings = await getSettings(tx);

  // Q7: tiền là số nguyên, giảm giá làm tròn xuống.
  const discountPercent = customer?.customerType.discountPercent ?? 0;
  const discountAmount = Math.floor((subtotal * discountPercent) / 100);
  const afterDiscount = subtotal - discountAmount;

  const cap = Math.floor((afterDiscount * settings.maxRedeemPercent) / 100);
  const maxRedeemPoints =
    customer && settings.isEnabled && settings.pointValue > 0
      ? Math.min(customer.points, Math.ceil(cap / settings.pointValue))
      : 0;

  let redeemAmount = 0;
  if (redeemPoints > 0) {
    if (!customer) throw new AppError(400, 'Cần gắn khách hàng để dùng điểm');
    if (!settings.isEnabled) throw new AppError(400, 'Chương trình tích điểm đang tắt');
    if (redeemPoints < settings.minRedeemPoints) {
      throw new AppError(400, `Cần đổi tối thiểu ${settings.minRedeemPoints} điểm`);
    }
    if (redeemPoints > customer.points) throw new AppError(400, 'Điểm của khách không đủ');
    if (redeemPoints > maxRedeemPoints) {
      throw new AppError(400, `Đơn này chỉ dùng được tối đa ${maxRedeemPoints} điểm`);
    }
    redeemAmount = redeemValue(settings, redeemPoints, afterDiscount);
  }

  const total = Math.max(0, afterDiscount - redeemAmount);
  return {
    subtotal,
    discountPercent,
    discountAmount,
    afterDiscount,
    pointsRedeemed: redeemPoints,
    redeemAmount,
    total,
    pointsEarned: customer ? pointsFromAmount(settings, total) : 0,
    maxRedeemPoints,
    minRedeemPoints: settings.minRedeemPoints,
    loyaltyEnabled: settings.isEnabled,
    customer: customer
      ? {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          points: customer.points,
          tierName: customer.customerType.name,
        }
      : null,
  };
}
