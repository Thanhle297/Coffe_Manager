import type { Prisma } from '../../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/** Hạng có ngưỡng cao nhất mà `lifetimePoints` còn đạt được. */
export async function resolveTierId(tx: Tx, lifetimePoints: number): Promise<number | null> {
  const tier = await tx.customerType.findFirst({
    where: { minPoints: { lte: lifetimePoints } },
    orderBy: { minPoints: 'desc' },
    select: { id: true },
  });
  return tier?.id ?? null;
}

/** Hạng thấp nhất, dùng làm hạng mặc định cho khách mới. */
export async function lowestTierId(tx: Tx): Promise<number | null> {
  const tier = await tx.customerType.findFirst({ orderBy: { minPoints: 'asc' }, select: { id: true } });
  return tier?.id ?? null;
}

/** Xét lại hạng của một khách theo tổng điểm tích lũy. */
export async function syncTier(tx: Tx, customerId: number) {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { lifetimePoints: true, customerTypeId: true },
  });
  if (!customer) return;
  const tierId = (await resolveTierId(tx, customer.lifetimePoints)) ?? (await lowestTierId(tx));
  if (tierId && tierId !== customer.customerTypeId) {
    await tx.customer.update({ where: { id: customerId }, data: { customerTypeId: tierId } });
  }
}

/** Xét lại hạng cho toàn bộ khách (sau khi đổi ngưỡng hoặc thêm/xóa hạng). */
export async function syncAllTiers(tx: Tx) {
  const tiers = await tx.customerType.findMany({ orderBy: { minPoints: 'asc' } });
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const upper = tiers[i + 1]?.minPoints;
    // Hạng thấp nhất nhận cả khách có điểm thấp hơn ngưỡng của nó.
    const range: { gte?: number; lt?: number } = {};
    if (i > 0) range.gte = tier.minPoints;
    if (upper !== undefined) range.lt = upper;
    await tx.customer.updateMany({
      where: { customerTypeId: { not: tier.id }, ...(Object.keys(range).length ? { lifetimePoints: range } : {}) },
      data: { customerTypeId: tier.id },
    });
  }
}
