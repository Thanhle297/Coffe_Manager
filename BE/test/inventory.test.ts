import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { addHours, todayVNString } from '../src/lib/dates.js';
import { prisma } from '../src/lib/prisma.js';
import { deductForOrder } from '../src/modules/stock/stock.service.js';
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

const today = () => todayVNString();

const newIngredient = (body: Record<string, unknown> = {}, token = manager) =>
  api().post('/ingredients').set(bearer(token)).send({ name: 'Cà phê hạt', unit: 'g', ...body });
const newSupplier = (body: Record<string, unknown> = {}, token = manager) =>
  api().post('/suppliers').set(bearer(token)).send({ name: 'NCC A', ...body });
const stockIn = (supplierId: number, items: unknown[], token = manager) =>
  api().post('/stock-in').set(bearer(token)).send({ supplierId, importDate: today(), items });
const stockOut = (body: Record<string, unknown>, token = manager) =>
  api().post('/stock-out').set(bearer(token)).send(body);
const qtyOf = async (id: number) => Number((await prisma.ingredient.findUniqueOrThrow({ where: { id } })).quantity);
const avgOf = async (id: number) => Number((await prisma.ingredient.findUniqueOrThrow({ where: { id } })).avgCost);
const lotsOf = (ingredientId: number) =>
  prisma.stockLot.findMany({ where: { ingredientId }, orderBy: { id: 'asc' } });

/** Bất biến: quantity = Σ remainingQty của các lô, với mọi nguyên liệu. */
async function expectInvariant() {
  const ings = await prisma.ingredient.findMany({ include: { lots: true } });
  for (const i of ings) {
    const sum = i.lots.reduce((s, l) => s + Number(l.remainingQty), 0);
    expect(Number(i.quantity), i.name).toBeCloseTo(sum, 3);
  }
}

/** Tạo nguyên liệu kèm các lô trực tiếp trong DB (bỏ qua API) để dựng kịch bản hạn. */
async function makeWithLots(
  data: Record<string, unknown>,
  lots: { qty: number; expiresAt?: Date | null; unitCost?: number }[] = [],
) {
  const quantity = lots.reduce((s, l) => s + l.qty, 0);
  const ing = await prisma.ingredient.create({ data: { unit: 'g', ...data, quantity } as never });
  for (const l of lots) {
    await prisma.stockLot.create({
      data: {
        ingredientId: ing.id,
        source: 'OPENING',
        initialQty: l.qty,
        remainingQty: l.qty,
        unitCost: l.unitCost ?? 0,
        expiresAt: l.expiresAt ?? null,
      },
    });
  }
  return ing;
}

describe('nguyên liệu và nhà cung cấp', () => {
  it('Quản lý CRUD nguyên liệu, trùng tên trả 409, Nhân viên ghi bị 403', async () => {
    const created = await newIngredient({ minStock: 100 });
    expect(created.status).toBe(201);
    expect(created.body.minStock).toBe('100');

    expect((await newIngredient()).status).toBe(409);
    expect((await newIngredient({ name: 'X' }, staff)).status).toBe(403);

    const id = created.body.id;
    const upd = await api().patch(`/ingredients/${id}`).set(bearer(manager)).send({ unit: 'kg' });
    expect(upd.body.unit).toBe('kg');
    expect((await api().patch(`/ingredients/${id}`).set(bearer(staff)).send({ unit: 'g' })).status).toBe(403);

    const list = await api().get('/ingredients?q=phê').set(bearer(staff));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);

    expect((await api().delete(`/ingredients/${id}`).set(bearer(manager))).status).toBe(204);
    expect((await api().get(`/ingredients/${id}`).set(bearer(manager))).status).toBe(404);
  });

  it('không cho sửa trực tiếp tồn kho và từ chối số lượng nhiều hơn 3 chữ số thập phân', async () => {
    const { body } = await newIngredient();
    await api().patch(`/ingredients/${body.id}`).set(bearer(manager)).send({ quantity: 99, name: 'Cà phê' });
    expect(await qtyOf(body.id)).toBe(0);
    expect((await newIngredient({ name: 'Y', minStock: 1.2345 })).status).toBe(400);
  });

  it('CRUD nhà cung cấp, tìm theo số điện thoại, trùng tên 409', async () => {
    expect((await newSupplier({ phone: '0901 234 567', email: 'a@b.vn' })).status).toBe(201);
    expect((await newSupplier()).status).toBe(409);
    expect((await newSupplier({ name: 'B' }, staff)).status).toBe(403);
    expect((await newSupplier({ name: 'C', email: 'sai' })).status).toBe(400);
    const res = await api().get('/suppliers?q=0901234').set(bearer(staff));
    expect(res.body.total).toBe(1);
  });
});

describe('loại nguyên liệu', () => {
  const newCategory = (body: Record<string, unknown> = {}, token = manager) =>
    api().post('/ingredient-categories').set(bearer(token)).send({ name: 'Sữa', icon: '🥛', ...body });

  it('Quản lý CRUD loại, trùng tên 409, Nhân viên chỉ xem', async () => {
    const created = await newCategory();
    expect(created.status).toBe(201);
    expect((await newCategory()).status).toBe(409);
    expect((await newCategory({ name: 'Trà' }, staff)).status).toBe(403);

    const upd = await api().patch(`/ingredient-categories/${created.body.id}`).set(bearer(manager)).send({ icon: '🍼' });
    expect(upd.body.icon).toBe('🍼');

    const list = await api().get('/ingredient-categories').set(bearer(staff));
    expect(list.status).toBe(200);
    expect(list.body[0].ingredientCount).toBe(0);

    expect((await api().delete(`/ingredient-categories/${created.body.id}`).set(bearer(manager))).status).toBe(204);
  });

  it('gán loại cho nguyên liệu, lọc theo loại, không xóa được loại đang dùng', async () => {
    const cat = (await newCategory()).body;
    expect((await newIngredient({ categoryId: 999999 })).status).toBe(400);

    const ing = await newIngredient({ name: 'Sữa tươi', categoryId: cat.id });
    expect(ing.body.category).toEqual({ id: cat.id, name: 'Sữa', icon: '🥛' });
    await newIngredient({ name: 'Không loại' });

    const byCat = await api().get(`/ingredients?categoryId=${cat.id}`).set(bearer(staff));
    expect(byCat.body.items.map((i: { name: string }) => i.name)).toEqual(['Sữa tươi']);
    const none = await api().get('/ingredients?categoryId=none').set(bearer(staff));
    expect(none.body.items.map((i: { name: string }) => i.name)).toEqual(['Không loại']);

    const del = await api().delete(`/ingredient-categories/${cat.id}`).set(bearer(manager));
    expect(del.status).toBe(409);

    const cleared = await api().patch(`/ingredients/${ing.body.id}`).set(bearer(manager)).send({ categoryId: null });
    expect(cleared.body.category).toBeNull();
    expect((await api().delete(`/ingredient-categories/${cat.id}`).set(bearer(manager))).status).toBe(204);
  });
});

describe('phiếu nhập', () => {
  it('tăng tồn và tính avgCost bình quân gia quyền qua hai lần nhập', async () => {
    const supplier = (await newSupplier()).body;
    const ing = (await newIngredient()).body;

    const first = await stockIn(supplier.id, [{ ingredientId: ing.id, quantity: 100, unitPrice: 10 }]);
    expect(first.status).toBe(201);
    expect(first.body.code).toBe(`PN-${today().replaceAll('-', '')}-0001`);
    expect(first.body.total).toBe(1000);

    const second = await stockIn(supplier.id, [{ ingredientId: ing.id, quantity: 300, unitPrice: 20 }]);
    expect(second.body.code).toMatch(/-0002$/);

    const after = (await api().get(`/ingredients/${ing.id}`).set(bearer(staff))).body;
    expect(Number(after.quantity)).toBe(400);
    expect(Number(after.avgCost)).toBe(17.5); // (100*10 + 300*20) / 400
  });

  it('mỗi dòng tạo một lô; hạn theo dòng, không có thì theo shelfLifeHours, không có nữa thì để trống', async () => {
    const supplier = (await newSupplier()).body;
    const a = (await newIngredient({ name: 'A' })).body;
    const b = (await newIngredient({ name: 'B', shelfLifeHours: 48 })).body;
    const c = (await newIngredient({ name: 'C' })).body;
    const res = await stockIn(supplier.id, [
      { ingredientId: a.id, quantity: 1, unitPrice: 1, expiryDate: '2030-01-01' },
      { ingredientId: b.id, quantity: 1, unitPrice: 1 },
      { ingredientId: c.id, quantity: 1, unitPrice: 1 },
    ]);
    expect(res.status).toBe(201);
    const [la] = await lotsOf(a.id);
    expect(la.expiresAt?.toISOString()).toBe('2030-01-01T16:59:59.000Z'); // 23:59:59 giờ VN
    expect(la.source).toBe('STOCK_IN');
    const [lb] = await lotsOf(b.id);
    const hours = (lb.expiresAt!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
    expect((await lotsOf(c.id))[0].expiresAt).toBeNull();
    await expectInvariant();
  });

  it('nhập theo quy cách: 2 bao × 280.000, hệ số 1000', async () => {
    const supplier = (await newSupplier()).body;
    const ing = (await newIngredient()).body;
    const unit = await api()
      .post(`/ingredients/${ing.id}/purchase-units`)
      .set(bearer(manager))
      .send({ name: 'Bao 1 kg', factor: 1000 });
    expect(unit.status).toBe(201);

    const res = await stockIn(supplier.id, [
      { ingredientId: ing.id, purchaseUnitId: unit.body.id, packQty: 2, packPrice: 280000 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(560000);
    expect(res.body.items[0].purchaseUnitName).toBe('Bao 1 kg');
    expect(Number(res.body.items[0].quantity)).toBe(2000);
    expect(Number(res.body.items[0].unitPrice)).toBe(280);
    expect(await qtyOf(ing.id)).toBe(2000);
    expect(await avgOf(ing.id)).toBe(280);
  });

  it('phiếu nhập có bán thành phẩm trả 400', async () => {
    const supplier = (await newSupplier()).body;
    const p = (await newIngredient({ name: 'Cốt', unit: 'ml', type: 'PREPARED', shelfLifeHours: 24 })).body;
    const res = await stockIn(supplier.id, [{ ingredientId: p.id, quantity: 1, unitPrice: 1 }]);
    expect(res.status).toBe(400);
  });

  it('một dòng lỗi thì không dòng nào được áp dụng', async () => {
    const supplier = (await newSupplier()).body;
    const ing = (await newIngredient()).body;
    const res = await stockIn(supplier.id, [
      { ingredientId: ing.id, quantity: 5, unitPrice: 10 },
      { ingredientId: 999999, quantity: 5, unitPrice: 10 },
    ]);
    expect(res.status).toBe(400);
    expect(await qtyOf(ing.id)).toBe(0);
    expect(await prisma.stockIn.count()).toBe(0);
  });

  it('kiểm tra đầu vào: trùng nguyên liệu, nhà cung cấp đã ẩn, Nhân viên bị 403', async () => {
    const supplier = (await newSupplier()).body;
    const ing = (await newIngredient()).body;
    const line = { ingredientId: ing.id, quantity: 1, unitPrice: 1 };
    expect((await stockIn(supplier.id, [line, line])).status).toBe(400);
    expect((await stockIn(supplier.id, [line], staff)).status).toBe(403);
    await api().patch(`/suppliers/${supplier.id}`).set(bearer(manager)).send({ isActive: false });
    expect((await stockIn(supplier.id, [line])).status).toBe(400);
  });

  it('danh sách lọc theo ngày, chi tiết kèm dòng', async () => {
    const supplier = (await newSupplier()).body;
    const ing = (await newIngredient()).body;
    const created = await stockIn(supplier.id, [{ ingredientId: ing.id, quantity: 2, unitPrice: 5 }]);
    const list = await api().get(`/stock-in?from=${today()}&to=${today()}`).set(bearer(staff));
    expect(list.body.total).toBe(1);
    expect((await api().get('/stock-in?from=2000-01-01&to=2000-01-02').set(bearer(staff))).body.total).toBe(0);
    const detail = await api().get(`/stock-in/${created.body.id}`).set(bearer(staff));
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.supplier.name).toBe('NCC A');
  });
});

describe('phiếu xuất', () => {
  const setup = async (qty = 100) => {
    const supplier = (await newSupplier()).body;
    const a = (await newIngredient({ name: 'A' })).body;
    const b = (await newIngredient({ name: 'B' })).body;
    await stockIn(supplier.id, [
      { ingredientId: a.id, quantity: qty, unitPrice: 10 },
      { ingredientId: b.id, quantity: qty, unitPrice: 4 },
    ]);
    return { a, b };
  };

  it('giảm tồn và chốt unitCost theo avgCost', async () => {
    const { a } = await setup();
    const res = await stockOut({ reason: 'USAGE', items: [{ ingredientId: a.id, quantity: 30.5 }] });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^PX-\d{8}-0001$/);
    expect(Number(res.body.items[0].unitCost)).toBe(10);
    expect(await qtyOf(a.id)).toBe(69.5);
  });

  it('xuất vượt tồn trả 409 liệt kê đủ tên và không đổi tồn', async () => {
    const { a, b } = await setup(10);
    const res = await stockOut({
      reason: 'USAGE',
      items: [
        { ingredientId: a.id, quantity: 11 },
        { ingredientId: b.id, quantity: 12 },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Không đủ tồn kho: A, B');
    expect(await qtyOf(a.id)).toBe(10);
    expect(await prisma.stockOut.count()).toBe(0);
  });

  it('một dòng thiếu thì dòng đủ cũng được hoàn lại', async () => {
    const { a, b } = await setup(10);
    const res = await stockOut({
      reason: 'ADJUST',
      items: [
        { ingredientId: a.id, quantity: 5 },
        { ingredientId: b.id, quantity: 50 },
      ],
    });
    expect(res.status).toBe(409);
    expect(await qtyOf(a.id)).toBe(10);
  });

  it('gộp dòng cùng nguyên liệu', async () => {
    const { a } = await setup(10);
    const res = await stockOut({
      reason: 'USAGE',
      items: [
        { ingredientId: a.id, quantity: 6 },
        { ingredientId: a.id, quantity: 6 },
      ],
    });
    expect(res.status).toBe(409);
  });

  it('nguyên liệu không tồn tại trả 400', async () => {
    const res = await stockOut({ reason: 'USAGE', items: [{ ingredientId: 999999, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('HỦY bắt buộc ghi chú, SALE không nhận từ client, Nhân viên bị 403', async () => {
    const { a } = await setup();
    const items = [{ ingredientId: a.id, quantity: 1 }];
    expect((await stockOut({ reason: 'DISCARD', items })).status).toBe(400);
    expect((await stockOut({ reason: 'DISCARD', note: 'Hết hạn', items })).status).toBe(201);
    expect((await stockOut({ reason: 'SALE', items })).status).toBe(400);
    expect((await stockOut({ reason: 'USAGE', items }, staff)).status).toBe(201);
    expect((await stockOut({ reason: 'DISCARD', note: 'Đổ vỡ', items }, staff)).status).toBe(201);
    expect((await stockOut({ reason: 'ADJUST', items }, staff)).status).toBe(403);
    await expectInvariant();
  });

  it('danh sách lọc theo lý do', async () => {
    const { a } = await setup();
    const items = [{ ingredientId: a.id, quantity: 1 }];
    await stockOut({ reason: 'USAGE', items });
    await stockOut({ reason: 'ADJUST', items });
    const res = await api().get('/stock-out?reason=ADJUST').set(bearer(staff));
    expect(res.body.total).toBe(1);
    expect((await api().get('/stock-out?reason=SALE').set(bearer(staff))).body.total).toBe(0);
  });

  it('deductForOrder tạo phiếu SALE và rollback khi thiếu tồn', async () => {
    const { a } = await setup(10);
    const out = await prisma.$transaction((tx) => deductForOrder(tx, 77, [{ ingredientId: a.id, quantity: 4 }]));
    expect(out.reason).toBe('SALE');
    expect(out.orderId).toBe(77);
    expect(out.createdById).toBeNull();
    expect(await qtyOf(a.id)).toBe(6);

    await expect(
      prisma.$transaction((tx) => deductForOrder(tx, 78, [{ ingredientId: a.id, quantity: 7 }])),
    ).rejects.toMatchObject({ status: 409 });
    expect(await qtyOf(a.id)).toBe(6);
  });
});

describe('lô và FEFO', () => {
  it('trừ lô sắp hết hạn trước và ghi phân bổ', async () => {
    const now = new Date();
    const ing = await makeWithLots({ name: 'A' }, [
      { qty: 10, expiresAt: addHours(now, 100) },
      { qty: 10, expiresAt: addHours(now, 10) },
      { qty: 10, expiresAt: null },
    ]);
    const [far, near, none] = await lotsOf(ing.id);
    const res = await stockOut({ reason: 'USAGE', items: [{ ingredientId: ing.id, quantity: 15 }] });
    expect(res.status).toBe(201);
    const alloc = res.body.items[0].allocations.map((a: { lotId: number; quantity: string }) => [a.lotId, Number(a.quantity)]);
    expect(alloc).toEqual([
      [near.id, 10],
      [far.id, 5],
    ]);
    const after = await lotsOf(ing.id);
    expect(after.map((l) => Number(l.remainingQty))).toEqual([5, 0, 10]);
    expect(none.id).toBe(after[2].id);
    await expectInvariant();
  });

  it('SALE bỏ qua lô hết hạn, chỉ còn lô hết hạn thì 409; DISCARD vẫn trừ được', async () => {
    const now = new Date();
    const ing = await makeWithLots({ name: 'A' }, [
      { qty: 5, expiresAt: addHours(now, -1) },
      { qty: 3, expiresAt: addHours(now, 5) },
    ]);
    const [expired] = await lotsOf(ing.id);

    const sale = await prisma.$transaction((tx) => deductForOrder(tx, 1, [{ ingredientId: ing.id, quantity: 3 }]));
    expect(sale.items[0].allocations).toHaveLength(1);
    expect(sale.items[0].allocations[0].lotId).not.toBe(expired.id);

    await expect(
      prisma.$transaction((tx) => deductForOrder(tx, 2, [{ ingredientId: ing.id, quantity: 1 }])),
    ).rejects.toMatchObject({ status: 409 });

    const discard = await stockOut({ reason: 'DISCARD', note: 'Hỏng', items: [{ ingredientId: ing.id, quantity: 2 }] });
    expect(discard.status).toBe(201);
    expect(discard.body.items[0].allocations[0].lotId).toBe(expired.id);
    await expectInvariant();
  });

  it('chỉ định lotId thì chỉ trừ lô đó', async () => {
    const now = new Date();
    const ing = await makeWithLots({ name: 'A' }, [
      { qty: 5, expiresAt: addHours(now, 5) },
      { qty: 5, expiresAt: addHours(now, 50) },
    ]);
    const [, second] = await lotsOf(ing.id);
    const res = await stockOut({ reason: 'USAGE', items: [{ ingredientId: ing.id, quantity: 2, lotId: second.id }] });
    expect(res.status).toBe(201);
    expect((await lotsOf(ing.id)).map((l) => Number(l.remainingQty))).toEqual([5, 3]);
    const other = await makeWithLots({ name: 'B' }, [{ qty: 5 }]);
    expect(
      (await stockOut({ reason: 'USAGE', items: [{ ingredientId: other.id, quantity: 1, lotId: second.id }] })).status,
    ).toBe(400);
  });

  it('hủy lô hết hạn: một phiếu DISCARD, Nhân viên làm được, không có thì trả null', async () => {
    const now = new Date();
    const a = await makeWithLots({ name: 'A' }, [
      { qty: 5, expiresAt: addHours(now, -2) },
      { qty: 4, expiresAt: addHours(now, 5) },
    ]);
    const b = await makeWithLots({ name: 'B' }, [{ qty: 7, expiresAt: addHours(now, -1) }]);

    const res = await api().post('/stock-out/discard-expired').set(bearer(staff)).send({});
    expect(res.status).toBe(200);
    expect(res.body.stockOut.reason).toBe('DISCARD');
    expect(res.body.stockOut.note).toBe('Hủy lô hết hạn');
    expect(await qtyOf(a.id)).toBe(4);
    expect(await qtyOf(b.id)).toBe(0);
    await expectInvariant();

    const again = await api().post('/stock-out/discard-expired').set(bearer(staff)).send({});
    expect(again.body.stockOut).toBeNull();
  });
});

describe('sơ chế', () => {
  /** Cà phê 2000 g giá 280 đ/g; Cốt phin: 1 mẻ 500 g → 1500 ml, hạn 24 giờ. */
  const setupPrep = async (coffeeQty = 2000) => {
    const supplier = (await newSupplier()).body;
    const coffee = (await newIngredient()).body;
    await stockIn(supplier.id, [{ ingredientId: coffee.id, quantity: coffeeQty, unitPrice: 280 }]);
    const cot = (await newIngredient({ name: 'Cốt phin', unit: 'ml', type: 'PREPARED', shelfLifeHours: 24 })).body;
    const recipe = await api()
      .put(`/ingredients/${cot.id}/prep-recipe`)
      .set(bearer(manager))
      .send({ batchYield: 1500, items: [{ ingredientId: coffee.id, quantity: 500 }] });
    expect(recipe.status).toBe(200);
    return { coffee, cot };
  };
  const prep = (body: Record<string, unknown>, token = staff) =>
    api().post('/prep-batches').set(bearer(token)).send(body);

  it('trừ nguyên liệu thô theo định mức × số mẻ, tạo lô có hạn, giá vốn theo sản lượng thực tế', async () => {
    const { coffee, cot } = await setupPrep();
    const res = await prep({ preparedId: cot.id, batches: 2, actualQty: 2950 });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^SC-\d{8}-0001$/);
    expect(Number(res.body.expectedQty)).toBe(3000);
    expect(Number(res.body.totalCost)).toBe(280000);
    expect(res.body.stockOut.reason).toBe('PREP');

    expect(await qtyOf(coffee.id)).toBe(1000);
    expect(await qtyOf(cot.id)).toBe(2950);
    const [lot] = await lotsOf(cot.id);
    expect(lot.source).toBe('PREP');
    expect(Number(lot.unitCost)).toBeCloseTo(280000 / 2950, 3);
    const hours = (lot.expiresAt!.getTime() - new Date(res.body.producedAt).getTime()) / 3_600_000;
    expect(hours).toBe(24);
    expect(await avgOf(cot.id)).toBeCloseTo(94.9153, 4);
    await expectInvariant();
  });

  it('sản lượng mặc định bằng định mức × số mẻ', async () => {
    const { cot } = await setupPrep();
    const res = await prep({ preparedId: cot.id, batches: 0.5 });
    expect(res.status).toBe(201);
    expect(await qtyOf(cot.id)).toBe(750);
  });

  it('thiếu nguyên liệu thô thì 409 và không thay đổi gì', async () => {
    const { coffee, cot } = await setupPrep(400);
    const res = await prep({ preparedId: cot.id, batches: 1 });
    expect(res.status).toBe(409);
    expect(await qtyOf(coffee.id)).toBe(400);
    expect(await qtyOf(cot.id)).toBe(0);
    expect(await prisma.prepBatch.count()).toBe(0);
  });

  it('không phải PREPARED hoặc chưa có định mức thì 400; định mức chỉ nhận nguyên liệu thô', async () => {
    const { coffee, cot } = await setupPrep();
    expect((await prep({ preparedId: coffee.id, batches: 1 })).status).toBe(400);
    const empty = (await newIngredient({ name: 'Trân châu', type: 'PREPARED', shelfLifeHours: 4 })).body;
    expect((await prep({ preparedId: empty.id, batches: 1 })).status).toBe(400);
    const bad = await api()
      .put(`/ingredients/${empty.id}/prep-recipe`)
      .set(bearer(manager))
      .send({ batchYield: 100, items: [{ ingredientId: cot.id, quantity: 1 }] });
    expect(bad.status).toBe(400);
  });

  it('bán thành phẩm bắt buộc có hạn; không đổi type khi đã có lô', async () => {
    expect((await newIngredient({ name: 'X', type: 'PREPARED' })).status).toBe(400);
    const { coffee } = await setupPrep();
    const res = await api().patch(`/ingredients/${coffee.id}`).set(bearer(manager)).send({ type: 'PREPARED', shelfLifeHours: 5 });
    expect(res.status).toBe(409);
  });

  it('cảnh báo EXPIRING cho bán thành phẩm còn ≤ 2 giờ', async () => {
    const now = new Date();
    await makeWithLots({ name: 'Cốt sắp hạn', type: 'PREPARED', shelfLifeHours: 24 }, [{ qty: 100, expiresAt: addHours(now, 1.5) }]);
    await makeWithLots({ name: 'Cốt còn lâu', type: 'PREPARED', shelfLifeHours: 24 }, [{ qty: 100, expiresAt: addHours(now, 3) }]);
    const res = await api().get('/ingredients/low-stock').set(bearer(staff));
    const names = res.body.map((i: { name: string }) => i.name);
    expect(names).toContain('Cốt sắp hạn');
    expect(names).not.toContain('Cốt còn lâu');
  });
});

describe('kiểm kê', () => {
  const count = (items: unknown[], token = manager) =>
    api().post('/stock-counts').set(bearer(token)).send({ items });

  it('âm tạo phiếu ADJUST, dương tạo lô COUNT giữ avgCost, bằng 0 chỉ lưu dòng', async () => {
    const now = new Date();
    const a = await makeWithLots({ name: 'A', avgCost: 10 }, [{ qty: 100, unitCost: 10 }]);
    const b = await makeWithLots({ name: 'B', avgCost: 20 }, [{ qty: 50, unitCost: 20, expiresAt: addHours(now, 72) }]);
    const c = await makeWithLots({ name: 'C' }, [{ qty: 5 }]);

    const res = await count([
      { ingredientId: a.id, actualQty: 95 },
      { ingredientId: b.id, actualQty: 60 },
      { ingredientId: c.id, actualQty: 5 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^KK-\d{8}-0001$/);
    expect(res.body.stockOut).not.toBeNull();
    expect(Number(res.body.diffValue)).toBe(-50 + 200);

    const adjust = await prisma.stockOut.findFirstOrThrow({ where: { stockCountId: res.body.id }, include: { items: true } });
    expect(adjust.reason).toBe('ADJUST');
    expect(adjust.items).toHaveLength(1);
    expect(await qtyOf(a.id)).toBe(95);

    expect(await qtyOf(b.id)).toBe(60);
    expect(await avgOf(b.id)).toBe(20);
    const countLot = (await lotsOf(b.id)).find((l) => l.source === 'COUNT')!;
    expect(Number(countLot.remainingQty)).toBe(10);
    expect(countLot.expiresAt?.getTime()).toBe(addHours(now, 72).getTime());

    expect(await qtyOf(c.id)).toBe(5);
    expect(await prisma.stockCountItem.count()).toBe(3);
    await expectInvariant();
  });

  it('Nhân viên bị 403 khi kiểm kê, sửa định mức, sửa quy cách', async () => {
    const a = await makeWithLots({ name: 'A' }, [{ qty: 1 }]);
    expect((await count([{ ingredientId: a.id, actualQty: 1 }], staff)).status).toBe(403);
    expect(
      (await api().put(`/ingredients/${a.id}/prep-recipe`).set(bearer(staff)).send({ batchYield: 1, items: [] })).status,
    ).toBe(403);
    expect(
      (await api().post(`/ingredients/${a.id}/purchase-units`).set(bearer(staff)).send({ name: 'Bao', factor: 1 })).status,
    ).toBe(403);
  });
});

describe('cảnh báo tồn kho', () => {
  it('LOW tính trên tồn dùng được, EXPIRING theo 7 ngày, EXPIRED khi còn lô hết hạn', async () => {
    const now = new Date();
    const day = 24;
    await makeWithLots({ name: 'đủ hàng', minStock: 10 }, [{ qty: 50 }]);
    await makeWithLots({ name: 'sắp hết', minStock: 10 }, [{ qty: 5 }]);
    await makeWithLots({ name: 'không ngưỡng', minStock: 0 });
    await makeWithLots({ name: 'sắp hạn', minStock: 10 }, [{ qty: 50, expiresAt: addHours(now, 6 * day) }]);
    await makeWithLots({ name: 'xa hạn' }, [{ qty: 50, expiresAt: addHours(now, 8 * day) }]);
    await makeWithLots({ name: 'hết hạn', minStock: 10 }, [
      { qty: 50, expiresAt: addHours(now, -1) },
      { qty: 50 },
    ]);
    await makeWithLots({ name: 'chỉ còn lô hết hạn', minStock: 10 }, [{ qty: 50, expiresAt: addHours(now, -1) }]);
    await makeWithLots({ name: 'đã ẩn', minStock: 10, isActive: false });

    const res = await api().get('/ingredients/low-stock').set(bearer(staff));
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.map((i: { name: string; reasons: string[] }) => [i.name, i.reasons]));
    expect(byName).toEqual({
      'sắp hết': ['LOW'],
      'sắp hạn': ['EXPIRING'],
      'hết hạn': ['EXPIRED'],
      'chỉ còn lô hết hạn': ['LOW', 'EXPIRED'],
    });

    const list = await api().get('/ingredients?q=chỉ còn').set(bearer(staff));
    expect(Number(list.body.items[0].usableQty)).toBe(0);
    expect(Number(list.body.items[0].quantity)).toBe(50);
  });
});

describe('xóa mềm', () => {
  it('nguyên liệu và nhà cung cấp đã có phiếu thì chuyển isActive=false, kích hoạt lại được', async () => {
    const supplier = (await newSupplier()).body;
    const ing = (await newIngredient()).body;
    await stockIn(supplier.id, [{ ingredientId: ing.id, quantity: 1, unitPrice: 1 }]);

    expect((await api().delete(`/ingredients/${ing.id}`).set(bearer(manager))).status).toBe(204);
    expect((await api().get(`/ingredients/${ing.id}`).set(bearer(manager))).body.isActive).toBe(false);
    expect((await api().delete(`/suppliers/${supplier.id}`).set(bearer(manager))).status).toBe(204);
    expect((await api().get(`/suppliers/${supplier.id}`).set(bearer(manager))).body.isActive).toBe(false);

    const back = await api().patch(`/ingredients/${ing.id}`).set(bearer(manager)).send({ isActive: true });
    expect(back.body.isActive).toBe(true);
  });
});
