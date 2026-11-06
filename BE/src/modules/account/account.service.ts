import { Role } from '../../generated/prisma/enums.js';
import { toAccountDto } from '../../lib/accountDto.js';
import { generateTemporaryPassword, hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { CreateAccountInput, UpdateAccountInput } from './account.schema.js';

export async function listAccounts() {
  const accounts = await prisma.account.findMany({ orderBy: { id: 'asc' } });
  return accounts.map(toAccountDto);
}

export async function createAccount(input: CreateAccountInput) {
  const existed = await prisma.account.findUnique({ where: { username: input.username } });
  if (existed) throw new AppError(409, 'Tên đăng nhập đã tồn tại');

  const account = await prisma.account.create({
    data: {
      username: input.username,
      fullName: input.fullName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      // Mật khẩu do Quản lý đặt nên người dùng phải tự đổi ở lần đăng nhập đầu.
      mustChangePassword: true,
    },
  });
  return toAccountDto(account);
}

export async function updateAccount(actorId: number, id: number, input: UpdateAccountInput) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.account.findUnique({ where: { id } });
    if (!target) throw new AppError(404, 'Không tìm thấy tài khoản');

    const nextRole = input.role ?? target.role;
    const nextActive = input.isActive ?? target.isActive;
    const roleChanged = nextRole !== target.role;
    const lockedNow = target.isActive && !nextActive;

    if (id === actorId && (lockedNow || nextRole !== Role.MANAGER)) {
      throw new AppError(400, 'Bạn không thể tự khóa hoặc hạ quyền chính mình');
    }

    // Luôn còn ít nhất một Quản lý đang hoạt động.
    const losesActiveManager =
      target.role === Role.MANAGER &&
      target.isActive &&
      (nextRole !== Role.MANAGER || !nextActive);
    if (losesActiveManager) {
      const others = await tx.account.count({
        where: { role: Role.MANAGER, isActive: true, id: { not: id } },
      });
      if (others === 0) {
        throw new AppError(400, 'Hệ thống phải còn ít nhất một Quản lý đang hoạt động');
      }
    }

    const updated = await tx.account.update({
      where: { id },
      data: {
        role: nextRole,
        isActive: nextActive,
        // Khóa hoặc đổi vai trò thì token cũ mất hiệu lực ngay.
        ...(lockedNow || roleChanged ? { tokenVersion: { increment: 1 } } : {}),
        // Mở lại tài khoản thì xóa luôn trạng thái khóa do nhập sai.
        ...(!target.isActive && nextActive ? { failedPwAttempts: 0, lockedUntil: null } : {}),
      },
    });
    return toAccountDto(updated);
  });
}

/** Đặt mật khẩu tạm ngẫu nhiên. Mật khẩu chỉ được trả về một lần duy nhất. */
export async function resetPassword(actorId: number, id: number) {
  if (id === actorId) {
    throw new AppError(400, 'Hãy dùng chức năng Đổi mật khẩu cho tài khoản của chính bạn');
  }
  const target = await prisma.account.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'Không tìm thấy tài khoản');

  const temporaryPassword = generateTemporaryPassword();
  await prisma.account.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedPwAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });
  return { temporaryPassword };
}
