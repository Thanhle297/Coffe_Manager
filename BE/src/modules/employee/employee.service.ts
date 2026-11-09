import type { Account, Employee, Prisma } from '../../generated/prisma/client.js';
import { EmployeeStatus } from '../../generated/prisma/enums.js';
import { toAccountDto } from '../../lib/accountDto.js';
import { toYmd } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { updateAccount } from '../account/account.service.js';
import type { CreateEmployeeInput, ListEmployeesQuery, UpdateEmployeeInput } from './employee.schema.js';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const uniqueTarget = (e: unknown) => String((e as { meta?: { target?: unknown } })?.meta?.target ?? '');

const toDto = ({ hireDate, account, ...e }: Employee & { account: Account | null }) => ({
  ...e,
  hireDate: toYmd(hireDate),
  account: account ? toAccountDto(account) : null,
});

async function getOrThrow(id: number) {
  const employee = await prisma.employee.findUnique({ where: { id }, include: { account: true } });
  if (!employee) throw new AppError(404, 'Không tìm thấy nhân viên');
  return employee;
}

/** Mã kế tiếp NV001, NV002... theo số lớn nhất hiện có. */
async function nextCode() {
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("code" FROM 3) AS INTEGER)) AS max FROM "Employee" WHERE "code" ~ '^NV[0-9]+$'`;
  const n = Number(rows[0]?.max ?? 0) + 1;
  return `NV${String(n).padStart(3, '0')}`;
}

export async function listEmployees(query: ListEmployeesQuery) {
  const where: Prisma.EmployeeWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.position ? { position: { equals: query.position, mode: 'insensitive' } } : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q.replace(/\s+/g, '') } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { account: true },
      orderBy: { code: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.employee.count({ where }),
  ]);
  return { items: items.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getEmployee(id: number) {
  return toDto(await getOrThrow(id));
}

export async function createEmployee(input: CreateEmployeeInput) {
  // Hai yêu cầu tạo cùng lúc có thể sinh cùng mã: thử lại vài lần.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.employee.create({
        data: {
          code: await nextCode(),
          fullName: input.fullName,
          gender: input.gender,
          position: input.position,
          phone: input.phone ?? null,
          address: input.address ?? null,
          hireDate: input.hireDate,
        },
        include: { account: true },
      });
      return toDto(created);
    } catch (e) {
      if (isUniqueViolation(e) && uniqueTarget(e).includes('code')) continue;
      throw e;
    }
  }
  throw new AppError(409, 'Không sinh được mã nhân viên, vui lòng thử lại');
}

export async function updateEmployee(actorId: number, id: number, input: UpdateEmployeeInput) {
  const employee = await getOrThrow(id);
  if (input.status === EmployeeStatus.RESIGNED && employee.status !== EmployeeStatus.RESIGNED) {
    await lockLinkedAccount(actorId, employee.accountId);
  }
  await prisma.employee.update({ where: { id }, data: input });
  return getEmployee(id);
}

/** Gắn (hoặc gỡ khi `accountId = null`) tài khoản đăng nhập cho nhân viên. */
export async function linkAccount(id: number, accountId: number | null) {
  await getOrThrow(id);
  if (accountId !== null) {
    const account = await prisma.account.findUnique({ where: { id: accountId }, include: { employee: true } });
    if (!account) throw new AppError(404, 'Không tìm thấy tài khoản');
    if (account.employee && account.employee.id !== id) {
      throw new AppError(409, `Tài khoản đã gắn với nhân viên ${account.employee.code}`);
    }
  }
  await prisma.employee.update({ where: { id }, data: { accountId } });
  return getEmployee(id);
}

/** Khóa tài khoản gắn với nhân viên nghỉ việc qua cơ chế có sẵn của module account (tăng tokenVersion). */
async function lockLinkedAccount(actorId: number, accountId: number | null) {
  if (accountId === null) return;
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.isActive) return;
  await updateAccount(actorId, accountId, { isActive: false });
}

/** Chưa có chấm công: xóa hẳn. Đã có: chuyển sang Nghỉ việc. Có tài khoản thì khóa luôn. */
export async function removeEmployee(actorId: number, id: number) {
  const employee = await getOrThrow(id);
  await lockLinkedAccount(actorId, employee.accountId);
  const used = await prisma.attendance.count({ where: { employeeId: id } });
  if (used > 0) {
    await prisma.employee.update({ where: { id }, data: { status: EmployeeStatus.RESIGNED } });
    return { deleted: false };
  }
  await prisma.employee.delete({ where: { id } });
  return { deleted: true };
}
