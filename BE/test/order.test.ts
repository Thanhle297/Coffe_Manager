import { beforeEach, describe, expect, it } from 'vitest';
import { LotSource, OrderStatus, Role, StockOutReason, TableStatus } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { api, bearer, createAccount, loginAs, resetDb, seedTiers } from './helpers.js';

let manager: string;
let staff: string;
let staffId: number;
let coffee: number;
let milk: number;
let pearl: number;
let drinkId: number;
let sizeS: number;
let sizeM: number;
let toppingId: number;
let tableId: number;

/** Tạo nguyên liệu kèm một lô tồn còn hạn (hoặc đã hết hạn). */
async function ingredient(name: string, qty: number, avgCost: number, expired = false) {
  const ing = await prisma.ingredient.create({ data: { name, unit: 'ml', avgCost, quantity: qty } });
  await prisma.stockLot.create({
    data: {
      ingredientId: ing.id,
      source: LotSource.OPENING,
      initialQty: qty,
      remainingQty: qty,
      unitCost: avgCost,
      expiresAt: expired ? new Date(Date.now() - 3_600_000) : null,
    },
  });
  return ing.id;
}

beforeEach(async () => {
  await resetDb();
  await seedTiers();
  await createAccount('boss', 'Password1', { role: Role.MANAGER });
  staffId = (await createAccount('an', 'Password1')).id;
  manager = await loginAs('boss', 'Password1');
  staff = await loginAs('an', 'Password1');

  coffee = await ingredient('Cốt cà phê', 1000, 100);
  milk = await ingredient('Sữa đặc', 1000, 50);
  pearl = await ingredient('Trân châu', 200, 20);

  const drink = await prisma.drink.create({
    data: {
      name: 'Cà phê sữa',
      isAvailable: true,
      sizes: {
        create: [
          { name: 'S', price: 25000, isDefault: true, recipe: { create: [{ ingredientId: coffee, quantity: 30 }, { ingredientId: milk, quantity: 20 }] } },
          { name: 'M', price: 30000, sortOrder: 1, recipe: { create: [{ ingredientId: coffee, quantity: 40 }, { ingredientId: milk, quantity: 25 }] } },
        ],
      },
    },
    include: { sizes: { orderBy: { sortOrder: 'asc' } } },
  });
  drinkId = drink.id;
  [sizeS, sizeM] = drink.sizes.map((s) => s.id);
  toppingId = (
    await prisma.topping.create({
      data: { name: 'Trân châu đen', price: 8000, recipe: { create: [{ ingredientId: pearl, quantity: 50 }] } },
    })
  ).id;
  await prisma.drinkTopping.create({ data: { drinkId, toppingId } });
  tableId = (await prisma.diningTable.create({ data: { name: 'Bàn 1' } })).id;
});

const open = (body: Record<string, unknown> = {}, token = staff) =>
  api().post('/orders').set(bearer(token)).send({ tableId, ...body });

const add = (orderId: number, body: Record<string, unknown> = {}, token = staff) =>
  api()
    .post(`/orders/${orderId}/items`)
    .set(bearer(token))
    .send({ drinkId, sizeId: sizeS, quantity: 1, ...body });

const pay = (orderId: number, body: Record<string, unknown> = {}, token = staff) =>
  api().post(`/orders/${orderId}/pay`).set(bearer(token)).send({ paymentMethod: 'CASH', ...body });

const tableStatus = async () => (await prisma.diningTable.findUniqueOrThrow({ where: { id: tableId } })).status;
const qtyOf = async (id: number) => (await prisma.ingredient.findUniqueOrThrow({ where: { id } })).quantity.toNumber();

async function customer(points = 0, lifetimePoints = points) {
  const tier = await prisma.customerType.findFirstOrThrow({
    where: { minPoints: { lte: lifetimePoints } },
    orderBy: { minPoints: 'desc' },
  });
  return prisma.customer.create({
    data: { fullName: 'Bình', phone: '0901234567', points, lifetimePoints, customerTypeId: tier.id },
  });
}

describe('Bàn', () => {
  it('Quản lý CRUD, Nhân viên bị 403, trùng tên 409', async () => {
    const res = await api().post('/tables').set(bearer(manager)).send({ name: 'Bàn 2', seats: 4 });
    expect(res.status).toBe(201);
    expect(res.body.currentOrder).toBeNull();
    expect((await api().post('/tables').set(bearer(manager)).send({ name: 'Bàn 2' })).status).toBe(409);
    expect((await api().post('/tables').set(bearer(staff)).send({ name: 'Bàn 3' })).status).toBe(403);
    const upd = await api().patch(`/tables/${res.body.id}`).set(bearer(manager)).send({ seats: 6 });
    expect(upd.body.seats).toBe(6);
    expect((await api().delete(`/tables/${res.body.id}`).set(bearer(manager))).status).toBe(204);
    expect(await prisma.diningTable.count({ where: { id: res.body.id } })).toBe(0);
  });

  it('bàn có đơn mở không xóa, không đổi trạng thái tay; đã có đơn cũ thì chỉ ẩn', async () => {
    const o = await open();
    expect((await api().delete(`/tables/${tableId}`).set(bearer(manager))).status).toBe(409);
    expect((await api().patch(`/tables/${tableId}/status`).set(bearer(staff)).send({ status: 'OCCUPIED' })).status).toBe(409);
    await api().post(`/orders/${o.body.id}/cancel`).set(bearer(staff));
    expect((await api().patch(`/tables/${tableId}/status`).set(bearer(staff)).send({ status: 'OCCUPIED' })).status).toBe(200);
    expect((await api().delete(`/tables/${tableId}`).set(bearer(manager))).status).toBe(204);
    expect((await prisma.diningTable.findUniqueOrThrow({ where: { id: tableId } })).isActive).toBe(false);
  });

  it('danh sách bàn kèm đơn đang mở', async () => {
    const o = await open();
    await add(o.body.id, { quantity: 2 });
    const res = await api().get('/tables').set(bearer(staff));
    expect(res.body[0].status).toBe(TableStatus.OCCUPIED);
    expect(res.body[0].currentOrder).toMatchObject({ id: o.body.id, itemCount: 2, subtotal: 50000 });
  });
});

describe('Đơn: mở và gọi món', () => {
  it('mở đơn: bàn SELECTING, mã HD; mở lần hai cùng bàn 409; bàn đã ẩn 400', async () => {
    const res = await open();
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^HD-\d{8}-0001$/);
    expect(await tableStatus()).toBe(TableStatus.SELECTING);
    expect((await open()).status).toBe(409);
    const hidden = await prisma.diningTable.create({ data: { name: 'Bàn ẩn', isActive: false } });
    expect((await open({ tableId: hidden.id })).status).toBe(400);
  });

  it('cộng dồn đúng cấu hình, khác topping hoặc ghi chú thì tách dòng', async () => {
    const o = (await open()).body;
    await add(o.id);
    await add(o.id, { quantity: 2 });
    await add(o.id, { toppings: [{ toppingId, quantity: 2 }] });
    const res = await add(o.id, { note: 'Ít đá' });
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.items[1].unitPrice).toBe(25000 + 2 * 8000);
    expect(res.body.items[1].toppings[0]).toMatchObject({ toppingId, quantity: 2, price: 8000 });
    expect(res.body.subtotal).toBe(3 * 25000 + 41000 + 25000);
    expect(res.body.items[0].unitCost).toBeUndefined();
    expect(await tableStatus()).toBe(TableStatus.OCCUPIED);
  });

  it('chặn món ngưng bán, size sai, topping không gán', async () => {
    const o = (await open()).body;
    const other = await prisma.topping.create({ data: { name: 'Thạch', price: 5000 } });
    expect((await add(o.id, { toppings: [{ toppingId: other.id, quantity: 1 }] })).status).toBe(400);
    expect((await add(o.id, { sizeId: 999999 })).status).toBe(400);
    expect((await add(o.id, { toppings: [{ toppingId, quantity: 4 }] })).status).toBe(400);
    await prisma.drink.update({ where: { id: drinkId }, data: { isAvailable: false } });
    expect((await add(o.id)).status).toBe(400);
  });

  it('giá chốt lúc thêm món: đổi giá size sau đó không đổi đơn', async () => {
    const o = (await open()).body;
    await add(o.id);
    await prisma.drinkSize.update({ where: { id: sizeS }, data: { price: 99000 } });
    const res = await add(o.id);
    expect(res.body.items[0]).toMatchObject({ quantity: 2, unitPrice: 25000 });
  });

  it('sửa số lượng, về 0 thì xóa dòng và bàn về SELECTING', async () => {
    const o = (await open()).body;
    const item = (await add(o.id)).body.items[0];
    const upd = await api().patch(`/orders/${o.id}/items/${item.id}`).set(bearer(staff)).send({ quantity: 4, note: '50% đường' });
    expect(upd.body.items[0]).toMatchObject({ quantity: 4, note: '50% đường' });
    const del = await api().patch(`/orders/${o.id}/items/${item.id}`).set(bearer(staff)).send({ quantity: 0 });
    expect(del.body.items).toHaveLength(0);
    expect(await tableStatus()).toBe(TableStatus.SELECTING);
  });

  it('Quản lý thấy giá vốn dòng', async () => {
    const o = (await open({}, manager)).body;
    const res = await add(o.id, {}, manager);
    expect(res.body.items[0].unitCost).toBe(30 * 100 + 20 * 50);
  });
});

describe('Đơn: thanh toán', () => {
  it('thanh toán: PAID, trừ kho theo công thức, phiếu SALE, cộng điểm, đồng bộ hạng, trả bàn', async () => {
    const c = await customer(0, 95);
    const o = (await open({ customerId: c.id })).body;
    await add(o.id, { quantity: 2, toppings: [{ toppingId, quantity: 1 }] });
    await add(o.id, { sizeId: sizeM });
    const res = await pay(o.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(OrderStatus.PAID);
    expect(res.body.subtotal).toBe(2 * 33000 + 30000);
    expect(res.body.total).toBe(96000);
    expect(res.body.pointsEarned).toBe(9);

    expect(await qtyOf(coffee)).toBe(1000 - 2 * 30 - 40);
    expect(await qtyOf(milk)).toBe(1000 - 2 * 20 - 25);
    expect(await qtyOf(pearl)).toBe(200 - 2 * 50);
    const so = await prisma.stockOut.findFirstOrThrow({ where: { orderId: o.id } });
    expect(so.reason).toBe(StockOutReason.SALE);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, include: { customerType: true } });
    expect(after.points).toBe(9);
    expect(after.customerType.name).toBe('Bạc');
    expect(await tableStatus()).toBe(TableStatus.AVAILABLE);
  });

  it('thiếu nguyên liệu (chỉ còn lô hết hạn): 409, không đổi gì', async () => {
    const c = await customer(50);
    const o = (await open({ customerId: c.id })).body;
    await add(o.id, { toppings: [{ toppingId, quantity: 3 }], quantity: 2 });
    await prisma.stockLot.updateMany({ where: { ingredientId: pearl }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const preview = await api().get(`/orders/${o.id}/preview`).set(bearer(staff));
    expect(preview.body.shortages[0]).toMatchObject({ ingredientId: pearl, required: 300, available: 0 });
    const res = await pay(o.id, { redeemPoints: 10 });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Trân châu');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(OrderStatus.OPEN);
    expect(await qtyOf(coffee)).toBe(1000);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).points).toBe(50);
    expect(await tableStatus()).toBe(TableStatus.OCCUPIED);
  });

  it('giảm giá theo hạng và đổi điểm trong giới hạn', async () => {
    const c = await customer(100, 300); // Vàng 10%
    const o = (await open({ customerId: c.id })).body;
    await add(o.id, { quantity: 4 }); // 100.000
    const pv = await api().get(`/orders/${o.id}/preview?redeemPoints=10`).set(bearer(staff));
    expect(pv.body).toMatchObject({ subtotal: 100000, discountAmount: 10000, afterDiscount: 90000, redeemAmount: 10000, total: 80000 });
    expect(pv.body.maxRedeemPoints).toBe(45); // 50% × 90.000 / 1.000
    expect((await pay(o.id, { redeemPoints: 46 })).status).toBe(400);
    await prisma.loyaltySetting.upsert({ where: { id: 1 }, update: { minRedeemPoints: 20 }, create: { id: 1, minRedeemPoints: 20 } });
    expect((await pay(o.id, { redeemPoints: 10 })).status).toBe(400);
    const res = await pay(o.id, { redeemPoints: 45 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ redeemAmount: 45000, total: 45000, pointsRedeemed: 45, pointsEarned: 4 });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).points).toBe(100 - 45 + 4);
  });

  it('đổi quá điểm đang có hoặc không có khách: 400', async () => {
    const c = await customer(5);
    const o = (await open({ customerId: c.id })).body;
    await add(o.id, { quantity: 4 });
    expect((await pay(o.id, { redeemPoints: 6 })).status).toBe(400);
    await api().patch(`/orders/${o.id}/customer`).set(bearer(staff)).send({ customerId: null });
    expect((await pay(o.id, { redeemPoints: 1 })).status).toBe(400);
  });

  it('đơn không có khách vẫn thanh toán, không cộng điểm', async () => {
    const o = (await open()).body;
    await add(o.id);
    const res = await pay(o.id, { paymentMethod: 'TRANSFER' });
    expect(res.body).toMatchObject({ status: 'PAID', paymentMethod: 'TRANSFER', total: 25000, pointsEarned: 0 });
  });

  it('đơn rỗng không thanh toán; đơn đã PAID hoặc CANCELLED không sửa được', async () => {
    const o = (await open()).body;
    expect((await pay(o.id)).status).toBe(400);
    await add(o.id);
    await pay(o.id);
    expect((await pay(o.id)).status).toBe(409);
    expect((await add(o.id)).status).toBe(409);
    expect((await api().post(`/orders/${o.id}/cancel`).set(bearer(staff))).status).toBe(409);

    const o2 = (await open()).body;
    const cancel = await api().post(`/orders/${o2.id}/cancel`).set(bearer(staff));
    expect(cancel.body.status).toBe(OrderStatus.CANCELLED);
    expect(await tableStatus()).toBe(TableStatus.AVAILABLE);
    expect((await add(o2.id)).status).toBe(409);
  });

  it('hai lần thanh toán đồng thời: chỉ một lần thành công, kho trừ một lần', async () => {
    const o = (await open()).body;
    await add(o.id);
    const results = await Promise.all([pay(o.id), pay(o.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await qtyOf(coffee)).toBe(1000 - 30);
    expect(await prisma.stockOut.count({ where: { orderId: o.id } })).toBe(1);
  });
});

describe('Đơn: tra cứu', () => {
  async function paidOrderAt(createdAt: Date, staff = staffId) {
    return prisma.order.create({
      data: {
        code: `HD-T-${createdAt.getTime()}`,
        tableId,
        staffId: staff,
        status: OrderStatus.PAID,
        total: 10000,
        createdAt,
        paidAt: createdAt,
      },
    });
  }

  it('lọc theo ngày đúng ranh giới giờ Việt Nam', async () => {
    const late = await paidOrderAt(new Date('2026-03-10T23:30:00+07:00'));
    const early = await paidOrderAt(new Date('2026-03-11T00:30:00+07:00'));
    const res = await api().get('/orders?from=2026-03-10&to=2026-03-10').set(bearer(manager));
    expect(res.body.items.map((o: { id: number }) => o.id)).toEqual([late.id]);
    expect(res.body.summary).toEqual({ paidCount: 1, revenue: 10000 });
    const next = await api().get('/orders?from=2026-03-11&to=2026-03-11').set(bearer(manager));
    expect(next.body.items.map((o: { id: number }) => o.id)).toEqual([early.id]);
  });

  it('Nhân viên chỉ thấy đơn của mình trong ngày', async () => {
    const mine = (await open()).body;
    await paidOrderAt(new Date('2026-03-10T10:00:00+07:00'));
    const boss = await prisma.account.findFirstOrThrow({ where: { role: Role.MANAGER } });
    const other = await prisma.diningTable.create({ data: { name: 'Bàn 2' } });
    await prisma.order.create({ data: { code: 'HD-X', tableId: other.id, staffId: boss.id } });
    const res = await api().get('/orders').set(bearer(staff));
    expect(res.body.items.map((o: { id: number }) => o.id)).toEqual([mine.id]);
    const all = await api().get('/orders').set(bearer(manager));
    expect(all.body.total).toBe(3);
  });
});

describe('Xóa mềm khi đã có hóa đơn', () => {
  it('món, topping, size, khách đã bán thì chỉ ẩn', async () => {
    const c = await customer();
    const o = (await open({ customerId: c.id })).body;
    await add(o.id, { sizeId: sizeM, toppings: [{ toppingId, quantity: 1 }] });
    await pay(o.id);

    const sizes = await api()
      .put(`/drinks/${drinkId}/sizes`)
      .set(bearer(manager))
      .send({ sizes: [{ id: sizeS, name: 'S', price: 25000, isDefault: true, recipe: [{ ingredientId: coffee, quantity: 30 }] }] });
    expect(sizes.status).toBe(200);
    expect((await prisma.drinkSize.findUniqueOrThrow({ where: { id: sizeM } })).isActive).toBe(false);

    expect((await api().delete(`/toppings/${toppingId}`).set(bearer(manager))).status).toBe(204);
    expect((await prisma.topping.findUniqueOrThrow({ where: { id: toppingId } })).isActive).toBe(false);
    expect((await api().delete(`/drinks/${drinkId}`).set(bearer(manager))).status).toBe(204);
    expect((await prisma.drink.findUniqueOrThrow({ where: { id: drinkId } })).isActive).toBe(false);
    expect((await api().delete(`/customers/${c.id}`).set(bearer(manager))).status).toBe(204);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).isActive).toBe(false);
  });
});
