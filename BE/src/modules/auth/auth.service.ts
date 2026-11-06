import { signToken } from '../../lib/jwt.js';
import { toAccountDto } from '../../lib/accountDto.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { ChangePasswordInput, LoginInput } from './auth.schema.js';

export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_MINUTES = 15;

const BAD_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng';

export interface LoginMeta {
  ip?: string;
  userAgent?: string;
}

const lockedMessage = (until: Date) =>
  `Tài khoản đang bị khóa tạm thời đến ${until.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })}. Vui lòng thử lại sau`;

/**
 * Ghi nhận một lần sai mật khẩu. Đủ MAX_FAILED_ATTEMPTS lần liên tiếp thì khóa
 * LOCK_MINUTES phút và đưa bộ đếm về 0. Trả về true nếu lần này vừa kích hoạt khóa.
 */
async function registerFailedAttempt(accountId: number): Promise<boolean> {
  const updated = await prisma.account.update({
    where: { id: accountId },
    data: { failedPwAttempts: { increment: 1 } },
    select: { failedPwAttempts: true },
  });
  if (updated.failedPwAttempts < MAX_FAILED_ATTEMPTS) return false;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      failedPwAttempts: 0,
      lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
    },
  });
  return true;
}

export async function login({ username, password }: LoginInput, meta: LoginMeta) {
  const log = (accountId: number | null, success: boolean) =>
    prisma.loginLog.create({
      data: { accountId, username, success, ip: meta.ip, userAgent: meta.userAgent },
    });

  const account = await prisma.account.findUnique({ where: { username } });
  if (!account) {
    await log(null, false);
    throw new AppError(401, BAD_CREDENTIALS);
  }

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    await log(account.id, false);
    throw new AppError(429, lockedMessage(account.lockedUntil));
  }

  if (!(await verifyPassword(password, account.passwordHash))) {
    await log(account.id, false);
    await registerFailedAttempt(account.id);
    throw new AppError(401, BAD_CREDENTIALS);
  }

  if (!account.isActive) {
    await log(account.id, false);
    throw new AppError(403, 'Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Quản lý');
  }

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: { failedPwAttempts: 0, lockedUntil: null },
  });
  await log(account.id, true);

  return { token: signToken(updated), account: toAccountDto(updated) };
}

export async function getMe(accountId: number) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AppError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  return toAccountDto(account);
}

export async function changePassword(
  accountId: number,
  { oldPassword, newPassword }: ChangePasswordInput,
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AppError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw new AppError(429, lockedMessage(account.lockedUntil));
  }

  if (!(await verifyPassword(oldPassword, account.passwordHash))) {
    const locked = await registerFailedAttempt(account.id);
    if (locked) {
      // Bị khóa: thu hồi luôn phiên hiện tại để người đang dò mật khẩu phải đăng nhập lại.
      await prisma.account.update({
        where: { id: account.id },
        data: { tokenVersion: { increment: 1 } },
      });
      throw new AppError(429, `Nhập sai mật khẩu quá ${MAX_FAILED_ATTEMPTS} lần, tài khoản bị khóa ${LOCK_MINUTES} phút`);
    }
    throw new AppError(400, 'Mật khẩu hiện tại không đúng');
  }

  if (await verifyPassword(newPassword, account.passwordHash)) {
    throw new AppError(400, 'Mật khẩu mới không được trùng mật khẩu cũ');
  }

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      failedPwAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });

  return { token: signToken(updated), account: toAccountDto(updated) };
}
