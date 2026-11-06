import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { api, bearer, createAccount, loginAs, resetDb } from './helpers.js';

let managerToken: string;
let managerId: number;

beforeEach(async () => {
  await resetDb();
  const manager = await createAccount('boss', 'Password1', { role: Role.MANAGER });
  managerId = manager.id;
  managerToken = await loginAs('boss', 'Password1');
});

describe('phân quyền', () => {
  it('Nhân viên gọi API Quản lý trả 403, chưa đăng nhập trả 401', async () => {
    await createAccount('an', 'Password1');
    const staffToken = await loginAs('an', 'Password1');

    expect((await api().get('/accounts').set(bearer(staffToken))).status).toBe(403);
    expect((await api().get('/accounts')).status).toBe(401);
  });
});

describe('POST /accounts', () => {
  it('Quản lý tạo tài khoản mới (mustChangePassword = true) và không lộ hash', async () => {
    const res = await api()
      .post('/accounts')
      .set(bearer(managerToken))
      .send({ username: 'Binh', password: 'Password1', fullName: 'Bình' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      username: 'binh',
      role: Role.STAFF,
      mustChangePassword: true,
    });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('trùng tên đăng nhập trả 409; mật khẩu ngắn trả 400', async () => {
    const dup = await api()
      .post('/accounts')
      .set(bearer(managerToken))
      .send({ username: 'boss', password: 'Password1', fullName: 'X' });
    expect(dup.status).toBe(409);

    const short = await api()
      .post('/accounts')
      .set(bearer(managerToken))
      .send({ username: 'cuong', password: '123', fullName: 'X' });
    expect(short.status).toBe(400);
  });
});

describe('PATCH /accounts/:id', () => {
  it('khóa tài khoản: nhân viên không đăng nhập được và token cũ chết', async () => {
    const staff = await createAccount('an', 'Password1');
    const staffToken = await loginAs('an', 'Password1');

    const res = await api()
      .patch(`/accounts/${staff.id}`)
      .set(bearer(managerToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);

    expect((await api().get('/auth/me').set(bearer(staffToken))).status).toBe(401);
    expect(
      (await api().post('/auth/login').send({ username: 'an', password: 'Password1' })).status,
    ).toBe(403);
  });

  it('đổi vai trò làm token cũ mất hiệu lực', async () => {
    const staff = await createAccount('an', 'Password1');
    const staffToken = await loginAs('an', 'Password1');

    await api()
      .patch(`/accounts/${staff.id}`)
      .set(bearer(managerToken))
      .send({ role: Role.MANAGER })
      .expect(200);

    expect((await api().get('/auth/me').set(bearer(staffToken))).status).toBe(401);
  });

  it('không tự khóa hoặc hạ quyền chính mình', async () => {
    const lock = await api()
      .patch(`/accounts/${managerId}`)
      .set(bearer(managerToken))
      .send({ isActive: false });
    const demote = await api()
      .patch(`/accounts/${managerId}`)
      .set(bearer(managerToken))
      .send({ role: Role.STAFF });
    expect(lock.status).toBe(400);
    expect(demote.status).toBe(400);
  });

  it('id không tồn tại trả 404; không có thay đổi trả 400', async () => {
    expect(
      (await api().patch('/accounts/99999').set(bearer(managerToken)).send({ isActive: false })).status,
    ).toBe(404);
    expect((await api().patch(`/accounts/${managerId}`).set(bearer(managerToken)).send({})).status).toBe(400);
  });
});

describe('POST /accounts/:id/reset-password', () => {
  it('đặt mật khẩu tạm: mật khẩu cũ hết hiệu lực, bật mustChangePassword, token cũ chết', async () => {
    const staff = await createAccount('an', 'Password1');
    const staffToken = await loginAs('an', 'Password1');

    const res = await api()
      .post(`/accounts/${staff.id}/reset-password`)
      .set(bearer(managerToken));
    expect(res.status).toBe(200);
    const { temporaryPassword } = res.body;
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);

    expect((await api().get('/auth/me').set(bearer(staffToken))).status).toBe(401);
    expect(
      (await api().post('/auth/login').send({ username: 'an', password: 'Password1' })).status,
    ).toBe(401);

    const login = await api().post('/auth/login').send({ username: 'an', password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.account.mustChangePassword).toBe(true);
  });

  it('mở khóa do nhập sai khi được đặt lại; không tự đặt lại chính mình', async () => {
    const staff = await createAccount('an', 'Password1');
    await prisma.account.update({
      where: { id: staff.id },
      data: { lockedUntil: new Date(Date.now() + 600_000) },
    });
    await api().post(`/accounts/${staff.id}/reset-password`).set(bearer(managerToken)).expect(200);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.lockedUntil).toBeNull();

    expect(
      (await api().post(`/accounts/${managerId}/reset-password`).set(bearer(managerToken))).status,
    ).toBe(400);
  });
});
