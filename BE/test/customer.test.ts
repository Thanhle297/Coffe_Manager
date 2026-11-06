import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { earnPoints, redeemPoints } from '../src/modules/customer/customer.service.js';
import { api, bearer, createAccount, loginAs, resetDb, seedTiers } from './helpers.js';

let manager: string;
let staff: string;

beforeEach(async () => {
  await resetDb();
  await seedTiers();
  await createAccount('boss', 'Password1', { role: Role.MANAGER });
  await createAccount('an', 'Password1');
  manager = await loginAs('boss', 'Password1');
  staff = await loginAs('an', 'Password1');
});

const newCustomer = (token = staff, phone = '0901234567') =>
  api().post('/customers').set(bearer(token)).send({ fullName: 'Nguyễn Văn A', phone });

describe('khách hàng CRUD', () => {
  it('Nhân viên tạo khách, gán hạng thấp nhất, chuẩn hóa số điện thoại', async () => {
    const res = await newCustomer(staff, '0901 234 567');
    expect(res.status).toBe(201);
    expect(res.body.phone).toBe('0901234567');
    expect(res.body.customerType.name).toBe('Thường');
    expect(res.body.points).toBe(0);
  });

  it('từ chối số điện thoại sai định dạng hoặc trùng', async () => {
    expect((await newCustomer(staff, '123')).status).toBe(400);
    expect((await newCustomer()).status).toBe(201);
    const dup = await newCustomer();
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Số điện thoại đã tồn tại');
  });

  it('tìm theo tên hoặc số điện thoại', async () => {
    await newCustomer();
    await api().post('/customers').set(bearer(staff)).send({ fullName: 'Trần B', phone: '0911111111' });
    const byName = await api().get('/customers?q=trần').set(bearer(staff));
    expect(byName.body.total).toBe(1);
    const byPhone = await api().get('/customers?q=0901').set(bearer(staff));
    expect(byPhone.body.items[0].phone).toBe('0901234567');
  });

  it('cập nhật, đổi sang số điện thoại đã có trả 409', async () => {
    const a = await newCustomer();
    await newCustomer(staff, '0911111111');
    const ok = await api().patch(`/customers/${a.body.id}`).set(bearer(staff)).send({ address: 'Đà Nẵng', birthday: '2000-05-01' });
    expect(ok.body.address).toBe('Đà Nẵng');
    expect(ok.body.birthday).toBe('2000-05-01');
    const dup = await api().patch(`/customers/${a.body.id}`).set(bearer(staff)).send({ phone: '0911111111' });
    expect(dup.status).toBe(409);
  });

  it('chỉ Quản lý được xóa', async () => {
    const c = await newCustomer();
    expect((await api().delete(`/customers/${c.body.id}`).set(bearer(staff))).status).toBe(403);
    expect((await api().delete(`/customers/${c.body.id}`).set(bearer(manager))).status).toBe(204);
    expect((await api().get(`/customers/${c.body.id}`).set(bearer(staff))).status).toBe(404);
  });
});

describe('điểm tích lũy', () => {
  it('Quản lý điều chỉnh điểm và ghi sổ; không cho trừ quá số dư; Nhân viên bị 403', async () => {
    const c = await newCustomer();
    const url = `/customers/${c.body.id}/points/adjust`;
    expect((await api().post(url).set(bearer(staff)).send({ delta: 10, note: 'x' })).status).toBe(403);
    const add = await api().post(url).set(bearer(manager)).send({ delta: 50, note: 'Tặng' });
    expect(add.body.points).toBe(50);
    expect((await api().post(url).set(bearer(manager)).send({ delta: -80, note: 'Trừ' })).status).toBe(400);
    const logs = await api().get(`/customers/${c.body.id}/points`).set(bearer(staff));
    expect(logs.body.total).toBe(1);
    expect(logs.body.items[0]).toMatchObject({ delta: 50, reason: 'ADJUST' });
  });

  it('earnPoints theo cấu hình, nâng hạng theo điểm tích lũy', async () => {
    const c = await newCustomer();
    await prisma.$transaction((tx) => earnPoints(tx, c.body.id, 1_250_000)); // 125 điểm
    const after = await api().get(`/customers/${c.body.id}`).set(bearer(staff));
    expect(after.body.points).toBe(125);
    expect(after.body.customerType.name).toBe('Bạc');
  });

  it('đổi tỷ lệ trong cấu hình thì lần cộng sau dùng tỷ lệ mới', async () => {
    const c = await newCustomer();
    await api().patch('/loyalty-settings').set(bearer(manager)).send({ amountPerPoint: 5000 });
    const earned = await prisma.$transaction((tx) => earnPoints(tx, c.body.id, 100_000));
    expect(earned).toBe(20);
  });

  it('redeemPoints trừ điểm, chặn theo mức giảm tối đa và không cho đổi quá số dư', async () => {
    const c = await newCustomer();
    await prisma.$transaction((tx) => earnPoints(tx, c.body.id, 1_000_000)); // 100 điểm
    // 100 điểm = 100.000đ nhưng hóa đơn 120.000đ chỉ được giảm tối đa 50% = 60.000đ
    const discount = await prisma.$transaction((tx) => redeemPoints(tx, c.body.id, 100, 120_000));
    expect(discount).toBe(60_000);
    await expect(prisma.$transaction((tx) => redeemPoints(tx, c.body.id, 1, 120_000))).rejects.toThrow();
  });
});
