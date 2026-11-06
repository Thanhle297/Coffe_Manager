import type { Prisma } from '../../generated/prisma/client.js';
import { todayVNString } from '../../lib/dates.js';

type Tx = Prisma.TransactionClient;

const MAX_RETRY = 3;
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';

/**
 * Chạy lại toàn bộ transaction khi trùng mã phiếu. Một lỗi P2002 làm hỏng cả transaction
 * Postgres nên không thể thử lại riêng câu insert.
 */
export async function withCodeRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= MAX_RETRY) throw e;
    }
  }
}

/** PN: phiếu nhập, PX: phiếu xuất, SC: phiếu sơ chế, KK: phiếu kiểm kê. */
export type CodeKind = 'PN' | 'PX' | 'SC' | 'KK';

/** Sinh mã dạng `PN-YYYYMMDD-0001` theo ngày giờ Việt Nam. */
export async function nextCode(tx: Tx, kind: CodeKind): Promise<string> {
  const prefix = `${kind}-${todayVNString().replaceAll('-', '')}-`;
  const args = { where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } } as const;
  const last =
    kind === 'PN'
      ? await tx.stockIn.findFirst(args)
      : kind === 'PX'
        ? await tx.stockOut.findFirst(args)
        : kind === 'SC'
          ? await tx.prepBatch.findFirst(args)
          : await tx.stockCount.findFirst(args);
  const seq = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}
