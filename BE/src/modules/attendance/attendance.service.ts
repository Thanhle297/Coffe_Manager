import type { Shift } from '../../generated/prisma/client.js';
import { EmployeeStatus } from '../../generated/prisma/enums.js';
import { addDays, toYmd } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { AttendanceBatchInput, ListAttendancesQuery } from './attendance.schema.js';

const DAY_MIN = 1440;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const ymdDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** Khoảng phút tuyệt đối của một ca vào một ngày; ca qua đêm kéo sang ngày sau. */
function interval(shift: Pick<Shift, 'startTime' | 'endTime'>, workDate: Date) {
  const base = Math.round(workDate.getTime() / 60_000);
  const start = base + toMinutes(shift.startTime);
  let end = base + toMinutes(shift.endTime);
  if (end <= start) end += DAY_MIN;
  return { start, end };
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

const attendanceInclude = {
  employee: { select: { id: true, code: true, fullName: true } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true } },
} as const;

const toDto = <T extends { workDate: Date }>({ workDate, ...a }: T) => ({ ...a, workDate: toYmd(workDate) });

/**
 * Chấm công hàng loạt cho một ngày, tất cả hoặc không dòng nào.
 * Chặn: nhân viên đã nghỉ, ca ngừng dùng, chấm trùng ca, hai ca trùng giờ (tính cả ca qua đêm của ngày kề).
 */
export async function createAttendances(actorId: number, input: AttendanceBatchInput) {
  const { workDate, entries } = input;
  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
  const shiftIds = [...new Set(entries.map((e) => e.shiftId))];

  return prisma.$transaction(async (tx) => {
    const [employees, shifts, existing] = await Promise.all([
      tx.employee.findMany({ where: { id: { in: employeeIds } } }),
      tx.shift.findMany({ where: { id: { in: shiftIds } } }),
      tx.attendance.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: addDays(workDate, -1), lte: addDays(workDate, 1) } },
        include: { shift: true },
      }),
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));

    const errors: string[] = [];
    const booked = new Map<number, { start: number; end: number; label: string }[]>();
    for (const a of existing) {
      const list = booked.get(a.employeeId) ?? [];
      list.push({ ...interval(a.shift, a.workDate), label: `${a.shift.name} ngày ${toYmd(a.workDate)}` });
      booked.set(a.employeeId, list);
    }

    for (const entry of entries) {
      const emp = empMap.get(entry.employeeId);
      const shift = shiftMap.get(entry.shiftId);
      if (!emp) {
        errors.push(`Không tìm thấy nhân viên #${entry.employeeId}`);
        continue;
      }
      if (!shift) {
        errors.push(`Không tìm thấy ca làm #${entry.shiftId}`);
        continue;
      }
      const who = `${emp.code} ${emp.fullName}`;
      if (emp.status !== EmployeeStatus.WORKING) {
        errors.push(`${who} đã nghỉ việc`);
        continue;
      }
      if (!shift.isActive) {
        errors.push(`Ca ${shift.name} đã ngừng sử dụng`);
        continue;
      }
      const range = interval(shift, workDate);
      const list = booked.get(emp.id) ?? [];
      const clash = list.find((b) => overlaps(b, range));
      if (clash) {
        errors.push(`${who}: ca ${shift.name} trùng giờ với ${clash.label}`);
        continue;
      }
      list.push({ ...range, label: `${shift.name} ngày ${toYmd(workDate)}` });
      booked.set(emp.id, list);
    }

    if (errors.length > 0) throw new AppError(409, errors.join('; '));

    const created = [];
    for (const entry of entries) {
      const row = await tx.attendance.create({
        data: {
          employeeId: entry.employeeId,
          shiftId: entry.shiftId,
          workDate,
          payAmount: shiftMap.get(entry.shiftId)!.pay,
          note: entry.note ?? null,
          createdById: actorId,
        },
        include: attendanceInclude,
      });
      created.push(toDto(row));
    }
    return created;
  }).catch((e) => {
    // Hai lần lưu đồng thời cùng nhân viên, ca, ngày.
    if ((e as { code?: string })?.code === 'P2002') throw new AppError(409, 'Nhân viên đã được chấm ca này trong ngày');
    throw e;
  });
}

export async function listAttendances(query: ListAttendancesQuery) {
  const rows = await prisma.attendance.findMany({
    where: {
      workDate: { gte: ymdDate(query.from), lte: ymdDate(query.to) },
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
    },
    include: attendanceInclude,
    orderBy: [{ workDate: 'asc' }, { shift: { startTime: 'asc' } }, { employeeId: 'asc' }],
  });
  return rows.map(toDto);
}

export async function removeAttendance(id: number) {
  const row = await prisma.attendance.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Không tìm thấy dòng chấm công');
  await prisma.attendance.delete({ where: { id } });
}

/** `[đầu tháng, đầu tháng sau)` cho chuỗi `YYYY-MM`. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

/**
 * Bảng lương tháng, tính động từ chấm công (mỗi dòng đã chốt `payAmount`).
 * Gồm nhân viên đang làm (kể cả chưa có ca) và nhân viên đã nghỉ nhưng có ca trong tháng.
 */
export async function getPayroll(month: string) {
  const range = monthRange(month);
  const groups = await prisma.attendance.groupBy({
    by: ['employeeId'],
    where: { workDate: range },
    _count: { _all: true },
    _sum: { payAmount: true },
  });
  const byEmp = new Map(groups.map((g) => [g.employeeId, g]));
  const employees = await prisma.employee.findMany({
    where: { OR: [{ status: EmployeeStatus.WORKING }, { id: { in: [...byEmp.keys()] } }] },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, fullName: true, position: true, status: true },
  });
  const items = employees.map((e) => {
    const g = byEmp.get(e.id);
    return { ...e, shiftCount: g?._count._all ?? 0, total: g?._sum.payAmount ?? 0 };
  });
  return {
    month,
    items,
    totalShifts: items.reduce((s, i) => s + i.shiftCount, 0),
    total: items.reduce((s, i) => s + i.total, 0),
  };
}

export async function getEmployeePayroll(employeeId: number, month: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, code: true, fullName: true, position: true, status: true },
  });
  if (!employee) throw new AppError(404, 'Không tìm thấy nhân viên');
  const rows = await prisma.attendance.findMany({
    where: { employeeId, workDate: monthRange(month) },
    include: attendanceInclude,
    orderBy: [{ workDate: 'asc' }, { shift: { startTime: 'asc' } }],
  });
  return {
    month,
    employee,
    items: rows.map(toDto),
    shiftCount: rows.length,
    total: rows.reduce((s, r) => s + r.payAmount, 0),
  };
}
