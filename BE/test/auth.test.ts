import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { api, bearer, createAccount, loginAs, resetDb } from './helpers.js';

beforeEach(resetDb);

describe('POST /auth/login', () => {
  it('đăng nhập đúng trả token + tài khoản (không lộ passwordHash) và ghi LoginLog', async () => {
    await createAccount('an', 'Password1');
    const res = await api().post('/auth/login').send({ username: 'an', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.account).toMatchObject({ username: 'an', role: Role.STAFF });
    expect(res.body.account.passwordHash).toBeUndefined();

    const logs = await prisma.loginLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ username: 'an', success: true });
  });

  it('sai mật khẩu và sai tên đăng nhập cùng trả thông báo chung', async () => {
    await createAccount('an', 'Password1');
    const wrongPw = await api().post('/auth/login').send({ username: 'an', password: 'nope' });
    const wrongUser = await api().post('/auth/login').send({ username: 'ghost', password: 'nope' });

    expect(wrongPw.status).toBe(401);
    expect(wrongUser.status).toBe(401);
    expect(wrongPw.body.message).toBe('Tên đăng nhập hoặc mật khẩu không đúng');
    expect(wrongUser.body.message).toBe(wrongPw.body.message);
    expect(await prisma.loginLog.count({ where: { success: false } })).toBe(2);
  });

  it('khóa tài khoản sau 3 lần sai liên tiếp, kể cả khi sau đó nhập đúng', async () => {
    await createAccount('an', 'Password1');
    for (let i = 0; i < 3; i++) {
      const res = await api().post('/auth/login').send({ username: 'an', password: 'bad' });
      expect(res.status).toBe(401);
    }
    const locked = await api().post('/auth/login').send({ username: 'an', password: 'Password1' });
    expect(locked.status).toBe(429);

    const account = await prisma.account.findUniqueOrThrow({ where: { username: 'an' } });
    expect(account.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('hết thời gian khóa thì đăng nhập lại được', async () => {
    const account = await createAccount('an', 'Password1');
    await prisma.account.update({
      where: { id: account.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const res = await api().post('/auth/login').send({ username: 'an', password: 'Password1' });
    expect(res.status).toBe(200);
  });

  it('đăng nhập đúng giữa chừng thì đặt lại bộ đếm sai', async () => {
    await createAccount('an', 'Password1');
    await api().post('/auth/login').send({ username: 'an', password: 'bad' });
    await api().post('/auth/login').send({ username: 'an', password: 'bad' });
    await api().post('/auth/login').send({ username: 'an', password: 'Password1' });
    const res = await api().post('/auth/login').send({ username: 'an', password: 'bad' });
    expect(res.status).toBe(401);
    const account = await prisma.account.findUniqueOrThrow({ where: { username: 'an' } });
    expect(account.lockedUntil).toBeNull();
  });

  it('tài khoản isActive=false không đăng nhập được', async () => {
    await createAccount('an', 'Password1', { isActive: false });
    const res = await api().post('/auth/login').send({ username: 'an', password: 'Password1' });
    expect(res.status).toBe(403);
  });

  it('thiếu dữ liệu trả 400', async () => {
    const res = await api().post('/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me', () => {
  it('không có token trả 401, có token trả tài khoản', async () => {
    await createAccount('an', 'Password1');
    expect((await api().get('/auth/me')).status).toBe(401);

    const token = await loginAs('an', 'Password1');
    const res = await api().get('/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('an');
  });

  it('token bị khóa tài khoản giữa chừng thì 401 ở request kế tiếp', async () => {
    const account = await createAccount('an', 'Password1');
    const token = await loginAs('an', 'Password1');
    await prisma.account.update({ where: { id: account.id }, data: { isActive: false } });
    expect((await api().get('/auth/me').set(bearer(token))).status).toBe(401);
  });
});

describe('POST /auth/change-password', () => {
  it('đổi thành công: token cũ chết (401), token mới dùng được, mật khẩu cũ không còn hiệu lực', async () => {
    await createAccount('an', 'Password1');
    const oldToken = await loginAs('an', 'Password1');

    const res = await api()
      .post('/auth/change-password')
      .set(bearer(oldToken))
      .send({ oldPassword: 'Password1', newPassword: 'NewPassword2' });
    expect(res.status).toBe(200);

    expect((await api().get('/auth/me').set(bearer(oldToken))).status).toBe(401);
    expect((await api().get('/auth/me').set(bearer(res.body.token))).status).toBe(200);
    expect(
      (await api().post('/auth/login').send({ username: 'an', password: 'Password1' })).status,
    ).toBe(401);
    expect(await loginAs('an', 'NewPassword2')).toBeTypeOf('string');
  });

  it('từ chối mật khẩu mới ngắn hơn 8 ký tự và mật khẩu trùng cũ', async () => {
    await createAccount('an', 'Password1');
    const token = await loginAs('an', 'Password1');

    const short = await api()
      .post('/auth/change-password')
      .set(bearer(token))
      .send({ oldPassword: 'Password1', newPassword: 'short' });
    expect(short.status).toBe(400);

    const same = await api()
      .post('/auth/change-password')
      .set(bearer(token))
      .send({ oldPassword: 'Password1', newPassword: 'Password1' });
    expect(same.status).toBe(400);
  });

  it('sai mật khẩu cũ 3 lần thì khóa tài khoản và thu hồi phiên hiện tại', async () => {
    await createAccount('an', 'Password1');
    const token = await loginAs('an', 'Password1');
    const attempt = () =>
      api()
        .post('/auth/change-password')
        .set(bearer(token))
        .send({ oldPassword: 'wrong', newPassword: 'NewPassword2' });

    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(429);

    expect((await api().get('/auth/me').set(bearer(token))).status).toBe(401);
    expect(
      (await api().post('/auth/login').send({ username: 'an', password: 'Password1' })).status,
    ).toBe(429);
  });

  it('mustChangePassword: chỉ gọi được /auth/me và /auth/change-password', async () => {
    await createAccount('boss', 'Password1', { role: Role.MANAGER, mustChangePassword: true });
    const token = await loginAs('boss', 'Password1');

    expect((await api().get('/auth/me').set(bearer(token))).status).toBe(200);
    expect((await api().get('/accounts').set(bearer(token))).status).toBe(403);

    const res = await api()
      .post('/auth/change-password')
      .set(bearer(token))
      .send({ oldPassword: 'Password1', newPassword: 'NewPassword2' });
    expect(res.status).toBe(200);
    expect(res.body.account.mustChangePassword).toBe(false);
    expect((await api().get('/accounts').set(bearer(res.body.token))).status).toBe(200);
  });
});
