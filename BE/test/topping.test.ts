import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { api, bearer, createAccount, loginAs, resetDb } from './helpers.js';

let manager: string;
let staff: string;
let pearl: number;

beforeEach(async () => {
  await resetDb();
  await createAccount('boss', 'Password1', { role: Role.MANAGER });
  await createAccount('an', 'Password1');
  manager = await loginAs('boss', 'Password1');
  staff = await loginAs('an', 'Password1');
  pearl = (await prisma.ingredient.create({ data: { name: 'Trân châu', unit: 'g', avgCost: 20 } })).id;
});

const newTopping = (body: Record<string, unknown> = {}) =>
  api()
    .post('/toppings')
    .set(bearer(manager))
    .send({ name: 'Trân châu đen', price: 8000, recipe: [{ ingredientId: pearl, quantity: 50 }], ...body });

describe('Topping', () => {
  it('tạo kèm công thức, tính giá vốn; STAFF không thấy cost', async () => {
    const res = await newTopping();
    expect(res.status).toBe(201);
    expect(res.body.cost).toBe(1000);
    expect(res.body.isAvailable).toBe(true);

    const asStaff = await api().get(`/toppings/${res.body.id}`).set(bearer(staff));
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.cost).toBeUndefined();
    expect(asStaff.body.recipe[0].cost).toBeUndefined();
    expect((await api().post('/toppings').set(bearer(staff)).send({})).status).toBe(403);
  });

  it('trùng tên 409, công thức rỗng 400, nguyên liệu đã ẩn 400', async () => {
    await newTopping();
    expect((await newTopping()).status).toBe(409);
    expect((await newTopping({ name: 'A', recipe: [] })).status).toBe(400);
    await prisma.ingredient.update({ where: { id: pearl }, data: { isActive: false } });
    expect((await newTopping({ name: 'B' })).status).toBe(400);
  });

  it('sửa công thức thay toàn bộ', async () => {
    const t = await newTopping();
    const sugar = await prisma.ingredient.create({ data: { name: 'Đường', unit: 'g' } });
    const res = await api()
      .put(`/toppings/${t.body.id}`)
      .set(bearer(manager))
      .send({ price: 9000, recipe: [{ ingredientId: sugar.id, quantity: 10 }] });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(9000);
    expect(res.body.recipe.map((r: { ingredientId: number }) => r.ingredientId)).toEqual([sugar.id]);
  });

  it('gán cho nhiều món và bật/tắt bán', async () => {
    const t = await newTopping();
    const d1 = await prisma.drink.create({ data: { name: 'Trà sữa' } });
    const d2 = await prisma.drink.create({ data: { name: 'Trà đen' } });
    const res = await api().put(`/toppings/${t.body.id}/drinks`).set(bearer(manager)).send({ drinkIds: [d1.id, d2.id] });
    expect(res.status).toBe(200);
    expect(res.body.drinkCount).toBe(2);
    expect(res.body.drinks).toHaveLength(2);

    expect((await api().put(`/toppings/${t.body.id}/drinks`).set(bearer(manager)).send({ drinkIds: [99999] })).status).toBe(400);

    const off = await api().patch(`/toppings/${t.body.id}/availability`).set(bearer(manager)).send({ isAvailable: false });
    expect(off.body.isAvailable).toBe(false);
  });

  it('xóa topping', async () => {
    const t = await newTopping();
    expect((await api().delete(`/toppings/${t.body.id}`).set(bearer(manager))).status).toBe(204);
    expect(await prisma.topping.count()).toBe(0);
  });
});
