import { Prisma } from '../../generated/prisma/client.js';
import { addHours, endOfDayVN, startOfDayVN } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { GroupBy, GroupedRangeQuery, RangeQuery } from './report.schema.js';

/*
 * Báo cáo chỉ đọc, tổng hợp bằng SQL (không tải từng dòng lên server).
 * Cột DateTime lưu UTC (timestamp không múi giờ), nên đổi sang giờ VN trước khi nhóm theo ngày.
 * Giá vốn dùng giá đã chốt lúc phát sinh: OrderItem.unitCost (đã gồm topping), StockOutItem.unitCost, StockLot.unitCost.
 */

const EXPIRING_DAYS = 3;
const WASTAGE_REASONS = ['USAGE', 'DISCARD', 'ADJUST'] as const;

type Bounds = { from: Date; to: Date };
const bounds = (q: RangeQuery): Bounds => ({ from: startOfDayVN(q.from), to: endOfDayVN(q.to) });

/** Cột timestamp (UTC) đổi sang giờ VN. Tên cột do code truyền vào, không từ người dùng. */
const localTs = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
/** Mốc thời gian JS đổi sang timestamp UTC để so với cột. */
const tsParam = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const between = (col: string, b: Bounds) => Prisma.sql`${Prisma.raw(col)} BETWEEN ${tsParam(b.from)} AND ${tsParam(b.to)}`;
/** Khóa kỳ = ngày bắt đầu kỳ dạng YYYY-MM-DD. `unit` đã qua Zod enum. */
const bucket = (unit: GroupBy, col: string) =>
  Prisma.sql`to_char(date_trunc(${Prisma.raw(`'${unit}'`)}, ${localTs(col)}), 'YYYY-MM-DD')`;
const paidOrders = (b: Bounds) => Prisma.sql`o.status = 'PAID' AND ${between('o."paidAt"', b)}`;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r0 = (n: number) => Math.round(n);

// ---------- Kỳ thời gian ----------

const pad = (n: number) => String(n).padStart(2, '0');
const ymdUTC = (d: Date) => d.toISOString().slice(0, 10);

function truncYmd(ymd: string, unit: GroupBy): string {
  const y = ymd.slice(0, 4);
  const m = Number(ymd.slice(5, 7));
  if (unit === 'day') return ymd;
  if (unit === 'month') return `${y}-${pad(m)}-01`;
  if (unit === 'quarter') return `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
  return `${y}-01-01`;
}

function nextStart(ymd: string, unit: GroupBy): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (unit === 'day') return ymdUTC(new Date(Date.UTC(y, m - 1, d + 1)));
  const months = unit === 'month' ? 1 : unit === 'quarter' ? 3 : 12;
  return ymdUTC(new Date(Date.UTC(y, m - 1 + months, 1)));
}

export function periodLabel(start: string, unit: GroupBy): string {
  const [y, m, d] = start.split('-');
  if (unit === 'day') return `${d}/${m}/${y}`;
  if (unit === 'month') return `${m}/${y}`;
  if (unit === 'quarter') return `Q${Math.floor((Number(m) - 1) / 3) + 1}/${y}`;
  return y;
}

/** Mọi kỳ trong khoảng, kể cả kỳ không có số liệu, để biểu đồ liền mạch. */
export function periodStarts(from: string, to: string, unit: GroupBy): string[] {
  const out: string[] = [];
  for (let p = truncYmd(from, unit); p <= to; p = nextStart(p, unit)) out.push(p);
  return out;
}

// ---------- Doanh thu ----------

type RevenueRow = { period: string; orders: number; subtotal: number; discount: number; redeem: number; total: number };

export async function getRevenue(q: GroupedRangeQuery) {
  const b = bounds(q);
  const [rows, byMethod, byCategory] = await Promise.all([
    prisma.$queryRaw<RevenueRow[]>`
      SELECT ${bucket(q.groupBy, 'o."paidAt"')} AS period,
             COUNT(*)::int AS orders,
             SUM(o.subtotal)::float8 AS subtotal,
             SUM(o."discountAmount")::float8 AS discount,
             SUM(o."redeemAmount")::float8 AS redeem,
             SUM(o.total)::float8 AS total
      FROM "Order" o
      WHERE ${paidOrders(b)}
      GROUP BY 1`,
    prisma.$queryRaw<{ method: string | null; orders: number; total: number }[]>`
      SELECT o."paymentMethod"::text AS method, COUNT(*)::int AS orders, SUM(o.total)::float8 AS total
      FROM "Order" o
      WHERE ${paidOrders(b)}
      GROUP BY 1
      ORDER BY 3 DESC`,
    prisma.$queryRaw<{ categoryId: number | null; name: string | null; quantity: number; revenue: number }[]>`
      SELECT d."categoryId" AS "categoryId", c.name AS name,
             SUM(oi.quantity)::int AS quantity,
             SUM(oi."unitPrice" * oi.quantity)::float8 AS revenue
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Drink" d ON d.id = oi."drinkId"
      LEFT JOIN "DrinkCategory" c ON c.id = d."categoryId"
      WHERE ${paidOrders(b)}
      GROUP BY d."categoryId", c.name
      ORDER BY revenue DESC`,
  ]);

  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const series = periodStarts(q.from, q.to, q.groupBy).map((p) => {
    const r = byPeriod.get(p);
    return {
      period: p,
      label: periodLabel(p, q.groupBy),
      orders: r?.orders ?? 0,
      subtotal: r0(r?.subtotal ?? 0),
      discount: r0((r?.discount ?? 0) + (r?.redeem ?? 0)),
      total: r0(r?.total ?? 0),
    };
  });
  const orders = series.reduce((s, r) => s + r.orders, 0);
  const total = series.reduce((s, r) => s + r.total, 0);
  return {
    from: q.from,
    to: q.to,
    groupBy: q.groupBy,
    series,
    byMethod: byMethod.map((m) => ({ method: m.method, orders: m.orders, total: r0(m.total) })),
    byCategory: byCategory.map((c) => ({
      categoryId: c.categoryId,
      name: c.name ?? 'Chưa phân loại',
      quantity: c.quantity,
      revenue: r0(c.revenue),
    })),
    summary: {
      orders,
      subtotal: series.reduce((s, r) => s + r.subtotal, 0),
      discount: series.reduce((s, r) => s + r.discount, 0),
      total,
      avgOrder: orders ? r0(total / orders) : 0,
    },
  };
}

// ---------- Đồ uống đã bán ----------

export async function getDrinksSold(q: RangeQuery) {
  const b = bounds(q);
  const [items, toppings] = await Promise.all([
    prisma.$queryRaw<
      {
        drinkId: number;
        drinkName: string;
        category: string | null;
        sizeId: number;
        sizeName: string;
        quantity: number;
        revenue: number;
        cost: number;
      }[]
    >`
      SELECT oi."drinkId" AS "drinkId", d.name AS "drinkName", c.name AS category,
             oi."sizeId" AS "sizeId", s.name AS "sizeName",
             SUM(oi.quantity)::int AS quantity,
             SUM(oi."unitPrice" * oi.quantity)::float8 AS revenue,
             SUM(oi."unitCost" * oi.quantity)::float8 AS cost
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Drink" d ON d.id = oi."drinkId"
      JOIN "DrinkSize" s ON s.id = oi."sizeId"
      LEFT JOIN "DrinkCategory" c ON c.id = d."categoryId"
      WHERE ${paidOrders(b)}
      GROUP BY oi."drinkId", d.name, c.name, oi."sizeId", s.name
      ORDER BY quantity DESC, revenue DESC`,
    // Số topping trên một ly × số ly của dòng.
    prisma.$queryRaw<{ toppingId: number; name: string; quantity: number; revenue: number; cost: number }[]>`
      SELECT t.id AS "toppingId", t.name AS name,
             SUM(ot.quantity * oi.quantity)::int AS quantity,
             SUM(ot.price * ot.quantity * oi.quantity)::float8 AS revenue,
             SUM(ot."unitCost" * ot.quantity * oi.quantity)::float8 AS cost
      FROM "OrderItemTopping" ot
      JOIN "OrderItem" oi ON oi.id = ot."orderItemId"
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Topping" t ON t.id = ot."toppingId"
      WHERE ${paidOrders(b)}
      GROUP BY t.id, t.name
      ORDER BY quantity DESC`,
  ]);

  const rows = items.map((i) => ({
    ...i,
    category: i.category ?? 'Chưa phân loại',
    revenue: r0(i.revenue),
    cost: r0(i.cost),
    profit: r0(i.revenue - i.cost),
  }));
  return {
    from: q.from,
    to: q.to,
    items: rows,
    toppings: toppings.map((t) => ({ ...t, revenue: r0(t.revenue), cost: r0(t.cost) })),
    totalQuantity: rows.reduce((s, i) => s + i.quantity, 0),
    totalRevenue: rows.reduce((s, i) => s + i.revenue, 0),
  };
}

// ---------- Lợi nhuận ----------

export async function getProfit(q: GroupedRangeQuery) {
  const b = bounds(q);
  const reasons = Prisma.join(WASTAGE_REASONS.map((r) => Prisma.sql`${Prisma.raw(`'${r}'`)}`));
  const [sales, wastage, surplus, payroll] = await Promise.all([
    prisma.$queryRaw<{ period: string; orders: number; revenue: number; cogs: number }[]>`
      SELECT ${bucket(q.groupBy, 'o."paidAt"')} AS period,
             COUNT(*)::int AS orders,
             SUM(o.total)::float8 AS revenue,
             COALESCE(SUM(c.cost), 0)::float8 AS cogs
      FROM "Order" o
      LEFT JOIN LATERAL (
        SELECT SUM(oi."unitCost" * oi.quantity) AS cost FROM "OrderItem" oi WHERE oi."orderId" = o.id
      ) c ON true
      WHERE ${paidOrders(b)}
      GROUP BY 1`,
    prisma.$queryRaw<{ period: string; reason: string; value: number }[]>`
      SELECT ${bucket(q.groupBy, 'so."createdAt"')} AS period, so.reason::text AS reason,
             SUM(si.quantity * si."unitCost")::float8 AS value
      FROM "StockOutItem" si
      JOIN "StockOut" so ON so.id = si."stockOutId"
      WHERE so.reason::text IN (${reasons}) AND ${between('so."createdAt"', b)}
      GROUP BY 1, 2`,
    // Dư khi kiểm kê tạo lô nguồn COUNT, bù lại phần hao hụt.
    prisma.$queryRaw<{ period: string; value: number }[]>`
      SELECT ${bucket(q.groupBy, 'l."createdAt"')} AS period,
             SUM(l."initialQty" * l."unitCost")::float8 AS value
      FROM "StockLot" l
      WHERE l.source = 'COUNT' AND ${between('l."createdAt"', b)}
      GROUP BY 1`,
    prisma.$queryRaw<{ period: string; value: number }[]>`
      SELECT to_char(date_trunc(${Prisma.raw(`'${q.groupBy}'`)}, a."workDate"::timestamp), 'YYYY-MM-DD') AS period,
             SUM(a."payAmount")::float8 AS value
      FROM "Attendance" a
      WHERE a."workDate" BETWEEN ${q.from}::date AND ${q.to}::date
      GROUP BY 1`,
  ]);

  const salesBy = new Map(sales.map((r) => [r.period, r]));
  const surplusBy = new Map(surplus.map((r) => [r.period, r.value]));
  const payrollBy = new Map(payroll.map((r) => [r.period, r.value]));
  const wastageBy = new Map<string, number>();
  const wastageByReason: Record<string, number> = { USAGE: 0, DISCARD: 0, ADJUST: 0 };
  for (const w of wastage) {
    wastageBy.set(w.period, (wastageBy.get(w.period) ?? 0) + w.value);
    wastageByReason[w.reason] = (wastageByReason[w.reason] ?? 0) + w.value;
  }

  const series = periodStarts(q.from, q.to, q.groupBy).map((p) => {
    const s = salesBy.get(p);
    const revenue = r0(s?.revenue ?? 0);
    const cogs = r0(s?.cogs ?? 0);
    const waste = r0(wastageBy.get(p) ?? 0);
    const countSurplus = r0(surplusBy.get(p) ?? 0);
    const salary = r0(payrollBy.get(p) ?? 0);
    const grossProfit = revenue - cogs;
    return {
      period: p,
      label: periodLabel(p, q.groupBy),
      orders: s?.orders ?? 0,
      revenue,
      cogs,
      grossProfit,
      wastage: waste,
      countSurplus,
      payroll: salary,
      netProfit: grossProfit - waste + countSurplus - salary,
    };
  });

  const sum = (k: 'orders' | 'revenue' | 'cogs' | 'grossProfit' | 'wastage' | 'countSurplus' | 'payroll' | 'netProfit') =>
    series.reduce((s, r) => s + r[k], 0);
  const revenue = sum('revenue');
  const grossProfit = sum('grossProfit');
  const netProfit = sum('netProfit');
  return {
    from: q.from,
    to: q.to,
    groupBy: q.groupBy,
    series,
    summary: {
      orders: sum('orders'),
      revenue,
      cogs: sum('cogs'),
      grossProfit,
      grossMargin: revenue ? grossProfit / revenue : 0,
      wastage: sum('wastage'),
      wastageByReason: Object.fromEntries(Object.entries(wastageByReason).map(([k, v]) => [k, r0(v)])),
      countSurplus: sum('countSurplus'),
      payroll: sum('payroll'),
      netProfit,
      netMargin: revenue ? netProfit / revenue : 0,
    },
  };
}

// ---------- Xuất nhập tồn ----------

type MoveRow = { ingredientId: number; kind: string; qty: number | null; value: number | null; after: number | null };

/**
 * Nhập = lô tạo mới (OPENING, STOCK_IN, PREP, COUNT); xuất = dòng phiếu xuất theo lý do.
 * Tồn cuối kỳ suy ngược từ tồn hiện tại trừ phát sinh sau kỳ; tồn đầu = tồn cuối − nhập + xuất trong kỳ.
 */
export async function getStockMovement(q: RangeQuery) {
  const b = bounds(q);
  const [ins, outs] = await Promise.all([
    prisma.$queryRaw<MoveRow[]>`
      SELECT l."ingredientId" AS "ingredientId", l.source::text AS kind,
             (SUM(l."initialQty") FILTER (WHERE ${between('l."createdAt"', b)}))::float8 AS qty,
             (SUM(l."initialQty" * l."unitCost") FILTER (WHERE ${between('l."createdAt"', b)}))::float8 AS value,
             (SUM(l."initialQty") FILTER (WHERE l."createdAt" > ${tsParam(b.to)}))::float8 AS after
      FROM "StockLot" l
      WHERE l."createdAt" >= ${tsParam(b.from)}
      GROUP BY 1, 2`,
    prisma.$queryRaw<MoveRow[]>`
      SELECT si."ingredientId" AS "ingredientId", so.reason::text AS kind,
             (SUM(si.quantity) FILTER (WHERE ${between('so."createdAt"', b)}))::float8 AS qty,
             (SUM(si.quantity * si."unitCost") FILTER (WHERE ${between('so."createdAt"', b)}))::float8 AS value,
             (SUM(si.quantity) FILTER (WHERE so."createdAt" > ${tsParam(b.to)}))::float8 AS after
      FROM "StockOutItem" si
      JOIN "StockOut" so ON so.id = si."stockOutId"
      WHERE so."createdAt" >= ${tsParam(b.from)}
      GROUP BY 1, 2`,
  ]);

  type Acc = { by: Record<string, number>; qty: number; value: number; after: number };
  const collect = (rows: MoveRow[]) => {
    const m = new Map<number, Acc>();
    for (const r of rows) {
      const a = m.get(r.ingredientId) ?? { by: {}, qty: 0, value: 0, after: 0 };
      if (r.qty) a.by[r.kind] = r3((a.by[r.kind] ?? 0) + r.qty);
      a.qty += r.qty ?? 0;
      a.value += r.value ?? 0;
      a.after += r.after ?? 0;
      m.set(r.ingredientId, a);
    }
    return m;
  };
  const inBy = collect(ins);
  const outBy = collect(outs);
  const moved = [...new Set([...inBy.keys(), ...outBy.keys()])];

  const ingredients = await prisma.ingredient.findMany({
    where: { OR: [{ isActive: true }, { id: { in: moved } }] },
    select: { id: true, name: true, unit: true, type: true, quantity: true, category: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

  const empty: Acc = { by: {}, qty: 0, value: 0, after: 0 };
  const items = ingredients.map((ing) => {
    const i = inBy.get(ing.id) ?? empty;
    const o = outBy.get(ing.id) ?? empty;
    const closing = ing.quantity.toNumber() - i.after + o.after;
    const opening = closing - i.qty + o.qty;
    return {
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      type: ing.type,
      category: ing.category?.name ?? null,
      opening: r3(opening),
      inQty: r3(i.qty),
      inBySource: i.by,
      inValue: r0(i.value),
      outQty: r3(o.qty),
      outByReason: o.by,
      outValue: r0(o.value),
      closing: r3(closing),
    };
  });
  return {
    from: q.from,
    to: q.to,
    items,
    totalInValue: items.reduce((s, i) => s + i.inValue, 0),
    totalOutValue: items.reduce((s, i) => s + i.outValue, 0),
  };
}

// ---------- Tồn kho hiện tại ----------

export async function getStockLevel() {
  const [ingredients, lots] = await Promise.all([
    prisma.ingredient.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        type: true,
        quantity: true,
        minStock: true,
        avgCost: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.stockLot.findMany({
      where: {
        remainingQty: { gt: 0 },
        expiresAt: { not: null, lte: addHours(new Date(), EXPIRING_DAYS * 24) },
      },
      select: {
        id: true,
        remainingQty: true,
        unitCost: true,
        expiresAt: true,
        ingredient: { select: { id: true, name: true, unit: true } },
      },
      orderBy: { expiresAt: 'asc' },
    }),
  ]);

  const items = ingredients.map((i) => {
    const quantity = i.quantity.toNumber();
    const minStock = i.minStock.toNumber();
    return {
      ingredientId: i.id,
      name: i.name,
      unit: i.unit,
      type: i.type,
      category: i.category?.name ?? null,
      quantity: r3(quantity),
      minStock: r3(minStock),
      avgCost: i.avgCost.toNumber(),
      value: r0(i.quantity.mul(i.avgCost).toNumber()),
      isLow: quantity < minStock,
    };
  });

  const byCategory = new Map<string, number>();
  for (const i of items) {
    const k = i.category ?? 'Chưa phân loại';
    byCategory.set(k, (byCategory.get(k) ?? 0) + i.value);
  }
  const now = Date.now();
  return {
    items,
    expiringLots: lots.map((l) => ({
      lotId: l.id,
      ingredientId: l.ingredient.id,
      name: l.ingredient.name,
      unit: l.ingredient.unit,
      remainingQty: r3(l.remainingQty.toNumber()),
      value: r0(l.remainingQty.mul(l.unitCost).toNumber()),
      expiresAt: l.expiresAt,
      expired: l.expiresAt!.getTime() <= now,
    })),
    byCategory: [...byCategory].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    summary: {
      totalValue: items.reduce((s, i) => s + i.value, 0),
      ingredientCount: items.length,
      lowCount: items.filter((i) => i.isLow).length,
    },
  };
}
