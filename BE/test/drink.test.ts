import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { consumptionOf, resolveLine } from '../src/modules/drink/menu.js';
import { api, bearer, createAccount, loginAs, resetDb } from './helpers.js';

let manager: string;
let staff: string;
let coffee: number;
let milk: number;
let pearl: number;

beforeEach(async () => {
  await resetDb();
  await createAccount('boss', 'Password1', { role: Role.MANAGER });
  await createAccount('an', 'Password1');
  manager = await loginAs('boss', 'Password1');
  staff = await loginAs('an', 'Password1');
  coffee = (await prisma.ingredient.create({ data: { name: 'Cốt cà phê', unit: 'ml', avgCost: 100 } })).id;
  milk = (await prisma.ingredient.create({ data: { name: 'Sữa đặc', unit: 'ml', avgCost: 50 } })).id;
  pearl = (await prisma.ingredient.create({ data: { name: 'Trân châu', unit: 'g', avgCost: 20 } })).id;
});

const size = (name: string, price: number, isDefault = false, coffeeQty = 30) => ({
  name,
  price,
  isDefault,
  recipe: [
    { ingredientId: coffee, quantity: coffeeQty },
    { ingredientId: milk, quantity: 20 },
  ],
});

const newDrink = (body: Record<string, unknown> = {}, token = manager) =>
  api()
    .post('/drinks')
    .set(bearer(token))
    .send({ name: 'Cà phê sữa', sizes: [size('S', 25000, true), size('M', 29000, false, 40), size('L', 35000, false, 50)], ...body });

const newTopping = () =>
  prisma.topping.create({
    data: { name: 'Trân châu đen', price: 8000, recipe: { create: [{ ingredientId: pearl, quantity: 50 }] } },
  });

describe('Đồ uống: CRUD và size', () => {
  it('tạo món 3 size, tự bật bán, tính cost và margin', async () => {
    const res = await newDrink();
    expect(res.status).toBe(201);
    expect(res.body.isAvailable).toBe(true);
    expect(res.body.sizes).toHaveLength(3);
    const s = res.body.sizes[0];
    expect(s.cost).toBe(30 * 100 + 20 * 50);
    expect(s.margin).toBe(25000 - 4000);
    expect(res.body.minPrice).toBe(25000);
    expect(res.body.maxPrice).toBe(35000);
  });

  it('STAFF đọc được nhưng không thấy giá vốn, không được ghi', async () => {
    const d = await newDrink();
    const res = await api().get(`/drinks/${d.body.id}`).set(bearer(staff));
    expect(res.status).toBe(200);
    expect(res.body.sizes[0].cost).toBeUndefined();
    expect(res.body.sizes[0].margin).toBeUndefined();
    expect(res.body.sizes[0].recipe[0].cost).toBeUndefined();
    expect((await newDrink({ name: 'X' }, staff)).status).toBe(403);
  });

  it('kiểm tra size: mặc định, trùng tên, nguyên liệu', async () => {
    expect((await newDrink({ sizes: [size('S', 1), size('M', 2)] })).status).toBe(400);
    expect((await newDrink({ sizes: [size('S', 1, true), size('M', 2, true)] })).status).toBe(400);
    expect((await newDrink({ sizes: [size('S', 1, true), size('s', 2)] })).status).toBe(400);
    const bad = { name: 'S', price: 1, isDefault: true, recipe: [{ ingredientId: 99999, quantity: 1 }] };
    expect((await newDrink({ sizes: [bad] })).status).toBe(400);
    await prisma.ingredient.update({ where: { id: milk }, data: { isActive: false } });
    expect((await newDrink({ sizes: [size('S', 1, true)] })).status).toBe(400);
  });

  it('trùng tên món trả 409', async () => {
    await newDrink();
    expect((await newDrink()).status).toBe(409);
  });

  it('saveSizes cập nhật, thêm, xóa size và thay công thức', async () => {
    const d = await newDrink();
    const [s, m] = d.body.sizes;
    const res = await api()
      .put(`/drinks/${d.body.id}/sizes`)
      .set(bearer(manager))
      .send({
        sizes: [
          { id: s.id, name: 'M', price: 26000, isDefault: false, recipe: [{ ingredientId: coffee, quantity: 35 }] },
          { id: m.id, name: 'S', price: 22000, isDefault: true, recipe: [{ ingredientId: coffee, quantity: 25 }] },
          size('XL', 45000),
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.sizes.map((x: { name: string }) => x.name).sort()).toEqual(['M', 'S', 'XL']);
    const renamed = res.body.sizes.find((x: { id: number }) => x.id === s.id);
    expect(renamed.name).toBe('M');
    expect(renamed.recipe).toHaveLength(1);
    expect(await prisma.drinkSize.count({ where: { drinkId: d.body.id } })).toBe(3);
  });

  it('bật bán khi size thiếu công thức trả 400', async () => {
    const d = await newDrink();
    await prisma.drinkRecipeItem.deleteMany({ where: { sizeId: d.body.sizes[1].id } });
    const res = await api().patch(`/drinks/${d.body.id}/availability`).set(bearer(manager)).send({ isAvailable: true });
    expect(res.status).toBe(400);
  });

  it('tìm kiếm và lọc', async () => {
    const cat = await prisma.drinkCategory.create({ data: { name: 'Cà phê' } });
    await newDrink({ categoryId: cat.id });
    await newDrink({ name: 'Trà đen', sizes: [size('Tiêu chuẩn', 20000, true)] });
    const q = await api().get('/drinks?q=CÀ PHÊ').set(bearer(staff));
    expect(q.body.items.map((d: { name: string }) => d.name)).toEqual(['Cà phê sữa']);
    const c = await api().get(`/drinks?categoryId=${cat.id}`).set(bearer(staff));
    expect(c.body.total).toBe(1);
    const none = await api().get('/drinks?categoryId=none').set(bearer(staff));
    expect(none.body.items[0].name).toBe('Trà đen');
    const price = await api().get('/drinks?minPrice=21000&maxPrice=30000').set(bearer(staff));
    expect(price.body.items.map((d: { name: string }) => d.name)).toEqual(['Cà phê sữa']);
    const avail = await api().get('/drinks?isAvailable=false').set(bearer(staff));
    expect(avail.body.total).toBe(0);
  });

  it('/drinks/menu chỉ trả món và topping đang bán, đúng topping được gán', async () => {
    const t = await newTopping();
    const off = await prisma.topping.create({
      data: { name: 'Thạch', price: 5000, isAvailable: false, recipe: { create: [{ ingredientId: pearl, quantity: 10 }] } },
    });
    const d = await newDrink({ toppingIds: [t.id, off.id] });
    const d2 = await newDrink({ name: 'Bạc xỉu', sizes: [size('S', 1, true)] });
    await api().patch(`/drinks/${d2.body.id}/availability`).set(bearer(manager)).send({ isAvailable: false });

    const res = await api().get('/drinks/menu').set(bearer(staff));
    expect(res.body.drinks.map((x: { name: string }) => x.name)).toEqual(['Cà phê sữa']);
    expect(res.body.drinks[0].toppings.map((x: { id: number }) => x.id)).toEqual([t.id]);
    expect(res.body.drinks[0].shortage).toBe(true);
    expect(d.status).toBe(201);
  });

  it('removeIngredient chỉ ẩn nguyên liệu đang có trong công thức', async () => {
    await newDrink();
    expect((await api().delete(`/ingredients/${coffee}`).set(bearer(manager))).status).toBe(204);
    const ing = await prisma.ingredient.findUnique({ where: { id: coffee } });
    expect(ing?.isActive).toBe(false);
  });

  it('xóa món', async () => {
    const d = await newDrink();
    expect((await api().delete(`/drinks/${d.body.id}`).set(bearer(manager))).status).toBe(204);
    expect(await prisma.drinkSize.count()).toBe(0);
  });
});

describe('menu.ts cho Order', () => {
  it('resolveLine tính unitPrice, unitCost có topping', async () => {
    const t = await newTopping();
    const d = await newDrink({ toppingIds: [t.id] });
    const sizeM = d.body.sizes[1];
    const line = await resolveLine(prisma, d.body.id, { sizeId: sizeM.id, toppings: [{ toppingId: t.id, quantity: 2 }] });
    expect(line.unitPrice).toBe(29000 + 8000 * 2);
    expect(Number(line.unitCost)).toBe(40 * 100 + 20 * 50 + 50 * 20 * 2);
    expect(line.toppings[0]).toMatchObject({ name: 'Trân châu đen', quantity: 2 });
  });

  it('topping chưa gán hoặc quá 3 phần trả 400', async () => {
    const t = await newTopping();
    const d = await newDrink();
    const sizeId = d.body.sizes[0].id;
    await expect(resolveLine(prisma, d.body.id, { sizeId, toppings: [{ toppingId: t.id, quantity: 1 }] })).rejects.toMatchObject({ status: 400 });
    await prisma.drinkTopping.create({ data: { drinkId: d.body.id, toppingId: t.id } });
    await expect(resolveLine(prisma, d.body.id, { sizeId, toppings: [{ toppingId: t.id, quantity: 4 }] })).rejects.toMatchObject({ status: 400 });
  });

  it('consumptionOf gộp nguyên liệu trùng giữa size và topping', async () => {
    const t = await prisma.topping.create({
      data: { name: 'Shot cà phê', price: 10000, recipe: { create: [{ ingredientId: coffee, quantity: 15 }] } },
    });
    const d = await newDrink({ toppingIds: [t.id] });
    const lines = await consumptionOf(prisma, { sizeId: d.body.sizes[0].id, toppings: [{ toppingId: t.id, quantity: 2 }] }, 3);
    const byId = new Map(lines.map((l) => [l.ingredientId, new Prisma.Decimal(l.quantity).toNumber()]));
    expect(byId.get(coffee)).toBe((30 + 15 * 2) * 3);
    expect(byId.get(milk)).toBe(20 * 3);
  });
});
