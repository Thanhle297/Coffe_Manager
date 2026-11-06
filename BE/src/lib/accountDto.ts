import type { Account } from '../generated/prisma/client.js';

/** Dạng tài khoản trả ra ngoài API: không bao giờ chứa passwordHash. */
export const toAccountDto = (a: Account) => ({
  id: a.id,
  username: a.username,
  fullName: a.fullName,
  role: a.role,
  isActive: a.isActive,
  mustChangePassword: a.mustChangePassword,
  lockedUntil: a.lockedUntil,
  createdAt: a.createdAt,
});

export type AccountDto = ReturnType<typeof toAccountDto>;
