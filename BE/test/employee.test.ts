import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { api, bearer, createAccount, loginAs, resetDb } from './helpers.js';

let manager: string;
let staff: string;

beforeEach(async () => {
  await resetDb();
  await createAccount('boss', 'Password1', { role: Role.MANAGER });
  await createAccount('an', 'Password1');
  manager = await loginAs('boss', 'Password1');
  staff = await loginAs('an', 'Password1');
});

const newEmployee = (data: Record<string, unknown> = {}) =>
  api()
    .post('/employees')
    .set(bearer(manager))
    .send({ fullName: 'Nguyễn Văn A', gender: 'MALE', position: 'Pha chế', hireDate: '2026-01-15', ...data });

const newShift = (data: Record<string, unknown> = {}) =>
  api()
    .post('/shifts')
    .set(bearer(manager))
    .send({ name: 'Ca sáng', startTime: '06:00', endTime: '12:00', pay: 150000, ...data });

const checkIn = (workDate: string, entries: { employeeId: number; shiftId: number }[]) =>
  api().post('/attendances').set(bearer(manager)).send({ workDate, entries });

describe('nhân viên', () => {
  it('tạo với mã tự sinh tăng dần, tìm theo tên và mã', async () => {
    const a = await newEmployee({ phone: '0901 234 567' });
    const b = await newEmployee({ fullName: 'Trần Thị B', gender: 'FEMALE' });
    expect(a.status).toBe(201);
    expect(a.body.code).toBe('NV001');
    expect(a.body.phone).toBe('0901234567');
    expect(a.body.hireDate).toBe('2026-01-15');
    expect(b.body.code).toBe('NV002');

    const byName = await api().get('/employees?q=trần').set(bearer(manager));
    expect(byName.body.items.map((e: { code: string }) => e.code)).toEqual(['NV002']);
    const byCode = await api().get('/employees?q=nv001').set(bearer(manager));
    expect(byCode.body.total).toBe(1);
  });

  it('sửa thông tin, dữ liệu sai trả 400', async () => {
    const { body } = await newEmployee();
    const res = await api().put(`/employees/${body.id}`).set(bearer(manager)).send({ position: 'Thu ngân' });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe('Thu ngân');
    expect((await newEmployee({ gender: 'X' })).status).toBe(400);
    expect((await newEmployee({ phone: '123' })).status).toBe(400);
  });

  it('STAFF bị 403 ở mọi endpoint', async () => {
    for (const path of ['/employees', '/shifts', '/attendances?from=2026-01-01&to=2026-01-31', '/payrolls?month=2026-01']) {
      expect((await api().get(path).set(bearer(staff))).status).toBe(403);
    }
    expect((await api().post('/employees').set(bearer(staff)).send({})).status).toBe(403);
  });

  it('xóa: chưa chấm công thì xóa hẳn, đã chấm công thì nghỉ việc và khóa tài khoản', async () => {
    const fresh = await newEmployee();
    const del = await api().delete(`/employees/${fresh.body.id}`).set(bearer(manager));
    expect(del.body.deleted).toBe(true);
    expect(await prisma.employee.count()).toBe(0);

    const emp = await newEmployee();
    const account = await prisma.account.findUniqueOrThrow({ where: { username: 'an' } });
    const link = await api()
      .patch(`/employees/${emp.body.id}/account`)
      .set(bearer(manager))
      .send({ accountId: account.id });
    expect(link.body.account.username).toBe('an');

    const shift = await newShift();
    await checkIn('2026-02-01', [{ employeeId: emp.body.id, shiftId: shift.body.id }]);

    const res = await api().delete(`/employees/${emp.body.id}`).set(bearer(manager));
    expect(res.body.deleted).toBe(false);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: emp.body.id }, include: { account: true } });
    expect(after.status).toBe('RESIGNED');
    expect(after.account?.isActive).toBe(false);
    // Token cũ của nhân viên mất hiệu lực.
    expect((await api().get('/auth/me').set(bearer(staff))).status).toBe(401);
  });

  it('không gắn một tài khoản cho hai nhân viên', async () => {
    const a = await newEmployee();
    const b = await newEmployee();
    const account = await prisma.account.findUniqueOrThrow({ where: { username: 'an' } });
    await api().patch(`/employees/${a.body.id}/account`).set(bearer(manager)).send({ accountId: account.id });
    const res = await api().patch(`/employees/${b.body.id}/account`).set(bearer(manager)).send({ accountId: account.id });
    expect(res.status).toBe(409);
  });
});

describe('ca làm', () => {
  it('CRUD và giờ không hợp lệ trả 400', async () => {
    const s = await newShift();
    expect(s.status).toBe(201);
    expect((await newShift({ name: 'Ca lỗi', startTime: '25:00' })).status).toBe(400);
    expect((await newShift({ name: 'Ca lỗi', endTime: '06:00' })).status).toBe(400);
    expect((await newShift()).status).toBe(409);
    const upd = await api().put(`/shifts/${s.body.id}`).set(bearer(manager)).send({ pay: 160000 });
    expect(upd.body.pay).toBe(160000);
    const del = await api().delete(`/shifts/${s.body.id}`).set(bearer(manager));
    expect(del.body.deleted).toBe(true);
  });

  it('xóa ca đã có chấm công thì chỉ ngừng dùng', async () => {
    const emp = await newEmployee();
    const s = await newShift();
    await checkIn('2026-02-01', [{ employeeId: emp.body.id, shiftId: s.body.id }]);
    const del = await api().delete(`/shifts/${s.body.id}`).set(bearer(manager));
    expect(del.body.deleted).toBe(false);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: s.body.id } })).isActive).toBe(false);
  });
});

describe('chấm công', () => {
  it('chấm hàng loạt; trùng ca, trùng giờ, nhân viên nghỉ việc đều 409 và không lưu dòng nào', async () => {
    const a = await newEmployee();
    const b = await newEmployee();
    const morning = await newShift();
    const midday = await newShift({ name: 'Ca giữa', startTime: '10:00', endTime: '14:00' });
    const afternoon = await newShift({ name: 'Ca chiều', startTime: '12:00', endTime: '18:00' });

    const ok = await checkIn('2026-02-01', [
      { employeeId: a.body.id, shiftId: morning.body.id },
      { employeeId: a.body.id, shiftId: afternoon.body.id },
      { employeeId: b.body.id, shiftId: morning.body.id },
    ]);
    expect(ok.status).toBe(201);
    expect(ok.body).toHaveLength(3);

    expect((await checkIn('2026-02-01', [{ employeeId: a.body.id, shiftId: morning.body.id }])).status).toBe(409);

    const before = await prisma.attendance.count();
    const clash = await checkIn('2026-02-02', [
      { employeeId: b.body.id, shiftId: afternoon.body.id },
      { employeeId: a.body.id, shiftId: morning.body.id },
      { employeeId: a.body.id, shiftId: midday.body.id },
    ]);
    expect(clash.status).toBe(409);
    expect(await prisma.attendance.count()).toBe(before);

    await api().put(`/employees/${b.body.id}`).set(bearer(manager)).send({ status: 'RESIGNED' });
    expect((await checkIn('2026-02-03', [{ employeeId: b.body.id, shiftId: morning.body.id }])).status).toBe(409);
  });

  it('ca qua đêm trùng giờ với ca sáng sớm ngày hôm sau', async () => {
    const a = await newEmployee();
    const night = await newShift({ name: 'Ca đêm', startTime: '22:00', endTime: '06:00' });
    const early = await newShift({ name: 'Ca sớm', startTime: '05:00', endTime: '09:00' });
    expect((await checkIn('2026-02-01', [{ employeeId: a.body.id, shiftId: night.body.id }])).status).toBe(201);
    expect((await checkIn('2026-02-02', [{ employeeId: a.body.id, shiftId: early.body.id }])).status).toBe(409);
  });

  it('xóa dòng chấm công nhập sai', async () => {
    const a = await newEmployee();
    const s = await newShift();
    const { body } = await checkIn('2026-02-01', [{ employeeId: a.body.id, shiftId: s.body.id }]);
    expect((await api().delete(`/attendances/${body[0].id}`).set(bearer(manager))).status).toBe(204);
    expect(await prisma.attendance.count()).toBe(0);
  });
});

describe('bảng lương', () => {
  it('đúng tổng theo tháng, đúng ranh giới ngày và không đổi khi sửa giá ca', async () => {
    const a = await newEmployee();
    const b = await newEmployee();
    const s = await newShift({ pay: 100000 });
    await checkIn('2026-01-31', [{ employeeId: a.body.id, shiftId: s.body.id }]);
    await checkIn('2026-02-01', [{ employeeId: a.body.id, shiftId: s.body.id }]);
    await checkIn('2026-02-28', [{ employeeId: a.body.id, shiftId: s.body.id }]);
    await checkIn('2026-03-01', [{ employeeId: a.body.id, shiftId: s.body.id }]);

    await api().put(`/shifts/${s.body.id}`).set(bearer(manager)).send({ pay: 200000 });

    const res = await api().get('/payrolls?month=2026-02').set(bearer(manager));
    expect(res.status).toBe(200);
    const rowA = res.body.items.find((i: { id: number }) => i.id === a.body.id);
    const rowB = res.body.items.find((i: { id: number }) => i.id === b.body.id);
    expect(rowA).toMatchObject({ shiftCount: 2, total: 200000 });
    expect(rowB).toMatchObject({ shiftCount: 0, total: 0 });
    expect(res.body.total).toBe(200000);

    const detail = await api().get(`/payrolls/${a.body.id}?month=2026-02`).set(bearer(manager));
    expect(detail.body.items.map((i: { workDate: string }) => i.workDate)).toEqual(['2026-02-01', '2026-02-28']);

    expect((await api().get('/payrolls?month=2026-13').set(bearer(manager))).status).toBe(400);
  });
});
