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

describe('Danh mục đồ uống', () => {
  it('CRUD và sắp theo sortOrder, name', async () => {
    const a = await api().post('/drink-categories').set(bearer(manager)).send({ name: 'Trà', sortOrder: 2 });
    expect(a.status).toBe(201);
    await api().post('/drink-categories').set(bearer(manager)).send({ name: 'Cà phê', sortOrder: 1 });

    const list = await api().get('/drink-categories').set(bearer(staff));
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Cà phê', 'Trà']);
    expect(list.body[0].drinkCount).toBe(0);

    const upd = await api().patch(`/drink-categories/${a.body.id}`).set(bearer(manager)).send({ name: 'Trà trái cây' });
    expect(upd.body.name).toBe('Trà trái cây');

    expect((await api().delete(`/drink-categories/${a.body.id}`).set(bearer(manager))).status).toBe(204);
  });

  it('trùng tên trả 409, STAFF không được ghi', async () => {
    await api().post('/drink-categories').set(bearer(manager)).send({ name: 'Trà' });
    expect((await api().post('/drink-categories').set(bearer(manager)).send({ name: 'Trà' })).status).toBe(409);
    expect((await api().post('/drink-categories').set(bearer(staff)).send({ name: 'X' })).status).toBe(403);
  });

  it('xóa danh mục còn món trả 409', async () => {
    const c = await prisma.drinkCategory.create({ data: { name: 'Cà phê' } });
    await prisma.drink.create({ data: { name: 'Bạc xỉu', categoryId: c.id } });
    expect((await api().delete(`/drink-categories/${c.id}`).set(bearer(manager))).status).toBe(409);
  });
});
