import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
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

describe('loại khách hàng', () => {
  it('mọi người xem được, chỉ Quản lý sửa được', async () => {
    const list = await api().get('/customer-types').set(bearer(staff));
    expect(list.body.map((t: { name: string }) => t.name)).toEqual(['Thường', 'Bạc', 'Vàng']);
    const body = { name: 'Kim cương', minPoints: 600, discountPercent: 15 };
    expect((await api().post('/customer-types').set(bearer(staff)).send(body)).status).toBe(403);
    expect((await api().post('/customer-types').set(bearer(manager)).send(body)).status).toBe(201);
  });

  it('không cho trùng tên hoặc ngưỡng điểm, % giảm phải 0–100', async () => {
    const dupName = await api().post('/customer-types').set(bearer(manager)).send({ name: 'Bạc', minPoints: 50, discountPercent: 1 });
    expect(dupName.status).toBe(409);
    const dupMin = await api().post('/customer-types').set(bearer(manager)).send({ name: 'Mới', minPoints: 100, discountPercent: 1 });
    expect(dupMin.status).toBe(409);
    const bad = await api().post('/customer-types').set(bearer(manager)).send({ name: 'Mới', minPoints: 50, discountPercent: 101 });
    expect(bad.status).toBe(400);
  });

  it('đổi ngưỡng thì xét lại hạng của khách', async () => {
    const c = await api().post('/customers').set(bearer(staff)).send({ fullName: 'A', phone: '0901234567' });
    const adjust = await api().post(`/customers/${c.body.id}/points/adjust`).set(bearer(manager)).send({ delta: 120, note: 'x' });
    expect(adjust.body.customerType.name).toBe('Thường'); // điều chỉnh không đổi điểm tích lũy
    const list = await api().get('/customer-types').set(bearer(manager));
    const silver = list.body.find((t: { name: string }) => t.name === 'Bạc');
    const bronze = list.body.find((t: { name: string }) => t.name === 'Thường');
    expect(bronze.customerCount).toBe(1);
    expect((await api().delete(`/customer-types/${bronze.id}`).set(bearer(manager))).status).toBe(409);
    expect((await api().patch(`/customer-types/${silver.id}`).set(bearer(manager)).send({ discountPercent: 7 })).body.discountPercent).toBe(7);
  });
});

describe('cấu hình tích điểm', () => {
  it('có giá trị mặc định, chỉ Quản lý sửa, kiểm tra giá trị', async () => {
    const get = await api().get('/loyalty-settings').set(bearer(staff));
    expect(get.body).toMatchObject({ amountPerPoint: 10000, pointValue: 1000, maxRedeemPercent: 50 });
    expect((await api().patch('/loyalty-settings').set(bearer(staff)).send({ pointValue: 500 })).status).toBe(403);
    expect((await api().patch('/loyalty-settings').set(bearer(manager)).send({ maxRedeemPercent: 150 })).status).toBe(400);
    expect((await api().patch('/loyalty-settings').set(bearer(manager)).send({ amountPerPoint: 0 })).status).toBe(400);
    const ok = await api().patch('/loyalty-settings').set(bearer(manager)).send({ pointValue: 500 });
    expect(ok.body.pointValue).toBe(500);
  });
});
