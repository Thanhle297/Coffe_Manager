import { beforeEach, describe, expect, it } from 'vitest';
import { LotSource, OrderStatus, PaymentMethod, Role, StockOutReason } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { api, bearer, createAccount, loginAs, resetDb } from './helpers.js';

let manager: string;
let staff: string;
let staffId: number;
let tableId: number;
let drinkId: number;
let sizeId: number;
let seq = 0;

/** Đơn đã chốt 1 dòng: `qty` ly giá 30.000, giá vốn 10.000/ly. */
async function order(status: OrderStatus, paidAt: Date | null, qty: number, discount = 0) {
  const subtotal = 30_000 * qty;
  return prisma.order.create({
    data: {
      code: `HD-T-${++seq}`,
      tableId,
      staffId,
      status,
      paymentMethod: status === OrderStatus.PAID ? PaymentMethod.CASH : null,
      subtotal,
      discountAmount: discount,
      total: subtotal - discount,
      paidAt,
      items: { create: { drinkId, sizeId, quantity: qty, unitPrice: 30_000, unitCost: 10_000 } },
    },
  });
}

beforeEach(async () => {
  await resetDb();
  await createAccount('boss', 'Password1', { role: Role.MANAGER });
  staffId = (await createAccount('an', 'Password1')).id;
  manager = await loginAs('boss', 'Password1');
  staff = await loginAs('an', 'Password1');
  tableId = (await prisma.diningTable.create({ data: { name: 'B1' } })).id;
  const cat = await prisma.drinkCategory.create({ data: { name: 'Cà phê' } });
  const drink = await prisma.drink.create({ data: { name: 'Bạc xỉu', categoryId: cat.id } });
  drinkId = drink.id;
  sizeId = (await prisma.drinkSize.create({ data: { drinkId, name: 'M', price: 30_000 } })).id;
});

describe('Báo cáo', () => {
  it('chỉ Quản lý được xem', async () => {
    const res = await api().get('/reports/stock-level').set(bearer(staff));
    expect(res.status).toBe(403);
  });

  it('doanh thu chỉ tính đơn đã thanh toán, nhóm theo ngày giờ VN', async () => {
    // 23:30 ngày 10/11 giờ VN = 16:30 UTC cùng ngày.
    await order(OrderStatus.PAID, new Date('2026-11-10T16:30:00Z'), 2, 5_000);
    await order(OrderStatus.PAID, new Date('2026-11-11T02:00:00Z'), 1);
    await order(OrderStatus.CANCELLED, null, 3);
    await order(OrderStatus.OPEN, null, 4);

    const res = await api()
      .get('/reports/revenue?from=2026-11-10&to=2026-11-11&groupBy=day')
      .set(bearer(manager));
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(2);
    expect(res.body.series[0]).toMatchObject({ period: '2026-11-10', orders: 1, total: 55_000, discount: 5_000 });
    expect(res.body.series[1]).toMatchObject({ period: '2026-11-11', orders: 1, total: 30_000 });
    expect(res.body.summary).toMatchObject({ orders: 2, total: 85_000 });
    expect(res.body.byCategory[0]).toMatchObject({ name: 'Cà phê', quantity: 3, revenue: 90_000 });
  });

  it('lợi nhuận trừ giá vốn đã chốt, hao hụt và lương', async () => {
    await order(OrderStatus.PAID, new Date('2026-11-10T03:00:00Z'), 3);
    const ing = await prisma.ingredient.create({ data: { name: 'Sữa', unit: 'ml' } });
    await prisma.stockOut.create({
      data: {
        code: 'PX-T-1',
        reason: StockOutReason.DISCARD,
        createdAt: new Date('2026-11-10T04:00:00Z'),
        items: { create: { ingredientId: ing.id, quantity: 100, unitCost: 20 } },
      },
    });
    const emp = await prisma.employee.create({
      data: { code: 'NV1', fullName: 'An', gender: 'MALE', position: 'Pha chế', hireDate: new Date('2026-01-01') },
    });
    const shift = await prisma.shift.create({ data: { name: 'Sáng', startTime: '07:00', endTime: '12:00', pay: 100_000 } });
    await prisma.attendance.create({
      data: { employeeId: emp.id, shiftId: shift.id, workDate: new Date('2026-11-10'), payAmount: 100_000 },
    });

    const res = await api().get('/reports/profit?from=2026-11-01&to=2026-11-30&groupBy=month').set(bearer(manager));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      revenue: 90_000,
      cogs: 30_000,
      grossProfit: 60_000,
      wastage: 2_000,
      payroll: 100_000,
      netProfit: -42_000,
    });
  });

  it('xuất nhập tồn: tồn đầu + nhập − xuất = tồn cuối', async () => {
    const ing = await prisma.ingredient.create({ data: { name: 'Đường', unit: 'g', quantity: 700 } });
    await prisma.stockLot.create({
      data: {
        ingredientId: ing.id,
        source: LotSource.STOCK_IN,
        initialQty: 1000,
        remainingQty: 700,
        unitCost: 5,
        createdAt: new Date('2026-11-10T03:00:00Z'),
      },
    });
    await prisma.stockOut.create({
      data: {
        code: 'PX-T-2',
        reason: StockOutReason.USAGE,
        createdAt: new Date('2026-11-12T03:00:00Z'),
        items: { create: { ingredientId: ing.id, quantity: 300, unitCost: 5 } },
      },
    });

    const res = await api().get('/reports/stock-movement?from=2026-11-10&to=2026-11-10').set(bearer(manager));
    expect(res.status).toBe(200);
    const row = res.body.items.find((i: { ingredientId: number }) => i.ingredientId === ing.id);
    expect(row).toMatchObject({ opening: 0, inQty: 1000, outQty: 0, closing: 1000, inValue: 5_000 });
  });
});
