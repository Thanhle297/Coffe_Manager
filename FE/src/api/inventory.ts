import { api } from './client';
import type { Paged } from './customers';

// ---------- Loại nguyên liệu ----------

export interface IngredientCategory {
  id: number;
  name: string;
  icon: string; // emoji
  ingredientCount?: number;
}

export type IngredientCategoryRef = Pick<IngredientCategory, 'id' | 'name' | 'icon'>;
export type IngredientCategoryInput = Pick<IngredientCategory, 'name' | 'icon'>;

/** Icon mặc định khi nguyên liệu chưa phân loại. */
export const DEFAULT_INGREDIENT_ICON = '📦';

export const listIngredientCategories = () =>
  api.get<IngredientCategory[]>('/ingredient-categories').then((r) => r.data);

export const createIngredientCategory = (input: IngredientCategoryInput) =>
  api.post<IngredientCategory>('/ingredient-categories', input).then((r) => r.data);

export const updateIngredientCategory = (id: number, input: Partial<IngredientCategoryInput>) =>
  api.patch<IngredientCategory>(`/ingredient-categories/${id}`, input).then((r) => r.data);

export const deleteIngredientCategory = (id: number) =>
  api.delete(`/ingredient-categories/${id}`).then(() => undefined);

// ---------- Nguyên liệu ----------

export type IngredientType = 'RAW' | 'PREPARED';

export const ingredientTypeLabel: Record<IngredientType, string> = {
  RAW: 'Nguyên liệu thô',
  PREPARED: 'Bán thành phẩm',
};

interface RawIngredient {
  id: number;
  name: string;
  unit: string;
  type: IngredientType;
  categoryId: number | null;
  category: IngredientCategoryRef | null;
  quantity: string;
  minStock: string;
  avgCost: string;
  usableQty: string;
  nextExpiresAt: string | null; // ISO
  shelfLifeHours: number | null;
  batchYield: string | null;
  isActive: boolean;
  /** Quy cách đang dùng, sắp theo hệ số giảm dần. */
  purchaseUnits?: { id: number; name: string; factor: string }[];
}

export interface PackUnit {
  id: number;
  name: string;
  factor: number;
}

export interface Ingredient
  extends Omit<RawIngredient, 'quantity' | 'minStock' | 'avgCost' | 'usableQty' | 'batchYield' | 'purchaseUnits'> {
  quantity: number;
  minStock: number;
  avgCost: number;
  usableQty: number;
  batchYield: number | null;
  purchaseUnits: PackUnit[];
}

export type LowStockReason = 'LOW' | 'EXPIRING' | 'EXPIRED';
export type LowStockIngredient = Ingredient & { reasons: LowStockReason[]; expiredQty: number };

export interface IngredientInput {
  name: string;
  unit: string;
  type: IngredientType;
  categoryId: number | null;
  minStock: number;
  shelfLifeHours: number | null;
  batchYield?: number | null;
}

/** Prisma trả Decimal dạng chuỗi; số `null` giữ nguyên. */
const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

const toIngredient = (r: RawIngredient): Ingredient => ({
  ...r,
  quantity: Number(r.quantity),
  minStock: Number(r.minStock),
  avgCost: Number(r.avgCost),
  usableQty: Number(r.usableQty ?? 0),
  batchYield: num(r.batchYield),
  purchaseUnits: (r.purchaseUnits ?? []).map((u) => ({ ...u, factor: Number(u.factor) })),
});

export interface IngredientListParams {
  q?: string;
  isActive?: boolean;
  type?: IngredientType;
  categoryId?: number | 'none';
  page: number;
  pageSize: number;
}

export const listIngredients = (params: IngredientListParams) =>
  api.get<Paged<RawIngredient>>('/ingredients', { params }).then((r) => ({
    ...r.data,
    items: r.data.items.map(toIngredient),
  }));

export const getIngredient = (id: number) =>
  api.get<RawIngredient>(`/ingredients/${id}`).then((r) => toIngredient(r.data));

export const getLowStock = () =>
  api
    .get<(RawIngredient & { reasons: LowStockReason[]; expiredQty: string })[]>('/ingredients/low-stock')
    .then((r) => r.data.map((i) => ({ ...toIngredient(i), reasons: i.reasons, expiredQty: Number(i.expiredQty) })));

export const createIngredient = (input: IngredientInput) =>
  api.post<RawIngredient>('/ingredients', input).then((r) => toIngredient(r.data));

export const updateIngredient = (id: number, input: Partial<IngredientInput> & { isActive?: boolean }) =>
  api.patch<RawIngredient>(`/ingredients/${id}`, input).then((r) => toIngredient(r.data));

export const deleteIngredient = (id: number) => api.delete(`/ingredients/${id}`).then(() => undefined);

// ---------- Lô hàng, thẻ kho ----------

export type LotSource = 'OPENING' | 'STOCK_IN' | 'PREP' | 'COUNT';
export type LotStatus = 'OK' | 'EXPIRING' | 'EXPIRED';

export const lotSourceLabel: Record<LotSource, string> = {
  OPENING: 'Tồn đầu kỳ',
  STOCK_IN: 'Nhập kho',
  PREP: 'Sơ chế',
  COUNT: 'Kiểm kê',
};

export interface StockLot {
  id: number;
  source: LotSource;
  initialQty: number;
  remainingQty: number;
  unitCost: number;
  expiresAt: string | null;
  createdAt: string;
  status: LotStatus;
  refCode: string | null;
  supplierName: string | null;
}

type RawLot = Omit<StockLot, 'initialQty' | 'remainingQty' | 'unitCost'> & {
  initialQty: string;
  remainingQty: string;
  unitCost: string;
};

export const listLots = (id: number) =>
  api.get<RawLot[]>(`/ingredients/${id}/lots`).then((r) =>
    r.data.map((l) => ({
      ...l,
      initialQty: Number(l.initialQty),
      remainingQty: Number(l.remainingQty),
      unitCost: Number(l.unitCost),
    })),
  );

export type MovementKind =
  | 'OPENING'
  | 'STOCK_IN'
  | 'PREP_OUTPUT'
  | 'COUNT_IN'
  | 'SALE'
  | 'USAGE'
  | 'DISCARD'
  | 'ADJUST'
  | 'PREP';

export const movementKindLabel: Record<MovementKind, string> = {
  OPENING: 'Tồn đầu kỳ',
  STOCK_IN: 'Nhập kho',
  PREP_OUTPUT: 'Sơ chế (thu)',
  COUNT_IN: 'Kiểm kê tăng',
  SALE: 'Bán hàng',
  USAGE: 'Sử dụng',
  DISCARD: 'Hủy',
  ADJUST: 'Điều chỉnh giảm',
  PREP: 'Sơ chế (dùng)',
};

export interface Movement {
  kind: MovementKind;
  refId: number | null;
  code: string | null;
  at: string;
  quantity: number;
  unitCost: number;
  note: string | null;
  balanceAfter: number;
}

export const listMovements = (id: number, params: { from?: string; to?: string; page: number; pageSize: number }) =>
  api
    .get<Paged<Omit<Movement, 'quantity' | 'unitCost' | 'balanceAfter'> & { quantity: string; unitCost: string; balanceAfter: string }>>(
      `/ingredients/${id}/movements`,
      { params },
    )
    .then((r) => ({
      ...r.data,
      items: r.data.items.map(
        (m): Movement => ({
          ...m,
          quantity: Number(m.quantity),
          unitCost: Number(m.unitCost),
          balanceAfter: Number(m.balanceAfter),
        }),
      ),
    }));

// ---------- Quy cách mua ----------

export interface PurchaseUnit {
  id: number;
  ingredientId: number;
  name: string;
  factor: number;
  isActive: boolean;
}

export const listPurchaseUnits = (ingredientId: number) =>
  api
    .get<(Omit<PurchaseUnit, 'factor'> & { factor: string })[]>(`/ingredients/${ingredientId}/purchase-units`)
    .then((r) => r.data.map((u) => ({ ...u, factor: Number(u.factor) })));

export const createPurchaseUnit = (ingredientId: number, input: { name: string; factor: number }) =>
  api.post(`/ingredients/${ingredientId}/purchase-units`, input).then(() => undefined);

export const updatePurchaseUnit = (
  ingredientId: number,
  unitId: number,
  input: Partial<{ name: string; factor: number; isActive: boolean }>,
) => api.patch(`/ingredients/${ingredientId}/purchase-units/${unitId}`, input).then(() => undefined);

export const deletePurchaseUnit = (ingredientId: number, unitId: number) =>
  api.delete(`/ingredients/${ingredientId}/purchase-units/${unitId}`).then(() => undefined);

// ---------- Định mức mẻ ----------

export interface PrepRecipe {
  batchYield: number | null;
  batchCost: number;
  items: {
    ingredientId: number;
    quantity: number;
    ingredient: { id: number; name: string; unit: string; avgCost: number; isActive: boolean };
  }[];
}

interface RawPrepRecipe {
  batchYield: string | null;
  batchCost: string;
  items: { ingredientId: number; quantity: string; ingredient: { id: number; name: string; unit: string; avgCost: string; isActive: boolean } }[];
}

const toPrepRecipe = (r: RawPrepRecipe): PrepRecipe => ({
  batchYield: num(r.batchYield),
  batchCost: Number(r.batchCost),
  items: r.items.map((i) => ({
    ...i,
    quantity: Number(i.quantity),
    ingredient: { ...i.ingredient, avgCost: Number(i.ingredient.avgCost) },
  })),
});

export const getPrepRecipe = (id: number) =>
  api.get<RawPrepRecipe>(`/ingredients/${id}/prep-recipe`).then((r) => toPrepRecipe(r.data));

export const setPrepRecipe = (id: number, input: { batchYield: number; items: { ingredientId: number; quantity: number }[] }) =>
  api.put<RawPrepRecipe>(`/ingredients/${id}/prep-recipe`, input).then((r) => toPrepRecipe(r.data));

// ---------- Nhà cung cấp ----------

export interface Supplier {
  id: number;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  isActive: boolean;
}

export type SupplierInput = Pick<Supplier, 'name' | 'address' | 'email' | 'phone' | 'description'>;

export const listSuppliers = (params: { q?: string; isActive?: boolean; page: number; pageSize: number }) =>
  api.get<Paged<Supplier>>('/suppliers', { params }).then((r) => r.data);

export const createSupplier = (input: SupplierInput) =>
  api.post<Supplier>('/suppliers', input).then((r) => r.data);

export const updateSupplier = (id: number, input: Partial<SupplierInput> & { isActive?: boolean }) =>
  api.patch<Supplier>(`/suppliers/${id}`, input).then((r) => r.data);

export const deleteSupplier = (id: number) => api.delete(`/suppliers/${id}`).then(() => undefined);

// ---------- Phiếu nhập ----------

interface Creator {
  id: number;
  fullName: string;
}
interface IngredientRef {
  id: number;
  name: string;
  unit: string;
  type?: IngredientType;
  category: { icon: string } | null;
}

export interface StockIn {
  id: number;
  code: string;
  importDate: string;
  note: string | null;
  total: number;
  createdAt: string;
  supplier: { id: number; name: string };
  createdBy: Creator;
}

export interface StockInItem {
  id: number;
  ingredient: IngredientRef;
  quantity: number;
  unitPrice: number;
  purchaseUnitName: string | null;
  packFactor: number | null;
  packQty: number | null;
  packPrice: number | null;
  expiresAt: string | null;
  lotId: number | null;
}

export interface StockInDetail extends StockIn {
  items: StockInItem[];
}

/** Dòng nhập theo quy cách (`purchaseUnitId`, `packQty`, `packPrice`) hoặc theo đơn vị gốc (`quantity`, `unitPrice`). */
export type StockInLineInput = { ingredientId: number; expiryDate?: string | null } & (
  | { purchaseUnitId: number; packQty: number; packPrice: number }
  | { quantity: number; unitPrice: number }
);

export interface StockInInput {
  supplierId: number;
  importDate: string;
  note?: string;
  items: StockInLineInput[];
}

export interface StockListParams {
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export const listStockIns = (params: StockListParams & { supplierId?: number }) =>
  api.get<Paged<StockIn>>('/stock-in', { params }).then((r) => r.data);

type RawStockInItem = Omit<StockInItem, 'quantity' | 'unitPrice' | 'packFactor' | 'packQty' | 'packPrice'> & {
  quantity: string;
  unitPrice: string;
  packFactor: string | null;
  packQty: string | null;
  packPrice: string | null;
};

export const getStockIn = (id: number) =>
  api.get<StockIn & { items: RawStockInItem[] }>(`/stock-in/${id}`).then(
    (r): StockInDetail => ({
      ...r.data,
      items: r.data.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        packFactor: num(i.packFactor),
        packQty: num(i.packQty),
        packPrice: num(i.packPrice),
      })),
    }),
  );

export const createStockIn = (input: StockInInput) =>
  api.post<StockIn>('/stock-in', input).then((r) => r.data);

// ---------- Phiếu xuất ----------

export type StockOutReason = 'SALE' | 'USAGE' | 'DISCARD' | 'ADJUST' | 'PREP';
export type ManualStockOutReason = 'USAGE' | 'DISCARD' | 'ADJUST';

export const stockOutReasonLabel: Record<StockOutReason, string> = {
  SALE: 'Bán hàng',
  USAGE: 'Sử dụng',
  DISCARD: 'Hủy',
  ADJUST: 'Điều chỉnh',
  PREP: 'Sơ chế',
};

export interface StockOut {
  id: number;
  code: string;
  reason: StockOutReason;
  orderId: number | null;
  note: string | null;
  createdAt: string;
  createdBy: Creator | null;
  prepBatch: { id: number; code: string } | null;
  stockCount: { id: number; code: string } | null;
}

export interface StockOutAllocation {
  id: number;
  lotId: number;
  quantity: number;
  lot: { id: number; source: LotSource; expiresAt: string | null; createdAt: string };
}

export interface StockOutItem {
  id: number;
  ingredient: IngredientRef;
  quantity: number;
  unitCost: number;
  allocations: StockOutAllocation[];
}

export interface StockOutDetail extends StockOut {
  items: StockOutItem[];
}

export interface StockOutInput {
  reason: ManualStockOutReason;
  note?: string;
  items: { ingredientId: number; quantity: number; lotId?: number }[];
}

export const listStockOuts = (params: StockListParams & { reason?: StockOutReason }) =>
  api.get<Paged<StockOut>>('/stock-out', { params }).then((r) => r.data);

type RawStockOutDetail = StockOut & {
  items: (Omit<StockOutItem, 'quantity' | 'unitCost' | 'allocations'> & {
    quantity: string;
    unitCost: string;
    allocations: (Omit<StockOutAllocation, 'quantity'> & { quantity: string })[];
  })[];
};

export const toStockOutDetail = (d: RawStockOutDetail): StockOutDetail => ({
  ...d,
  items: d.items.map((i) => ({
    ...i,
    quantity: Number(i.quantity),
    unitCost: Number(i.unitCost),
    allocations: i.allocations.map((a) => ({ ...a, quantity: Number(a.quantity) })),
  })),
});

export const getStockOut = (id: number) =>
  api.get<RawStockOutDetail>(`/stock-out/${id}`).then((r) => toStockOutDetail(r.data));

export const createStockOut = (input: StockOutInput) =>
  api.post<StockOut>('/stock-out', input).then((r) => r.data);

export const discardExpired = (ingredientIds?: number[]) =>
  api
    .post<{ stockOut: RawStockOutDetail | null }>('/stock-out/discard-expired', { ingredientIds })
    .then((r) => (r.data.stockOut ? toStockOutDetail(r.data.stockOut) : null));

// ---------- Phiếu sơ chế ----------

export interface PrepBatch {
  id: number;
  code: string;
  batches: number;
  expectedQty: number;
  actualQty: number;
  totalCost: number;
  producedAt: string;
  expiresAt: string;
  note: string | null;
  prepared: IngredientRef;
  createdBy: Creator;
  lot: { id: number; unitCost: number; remainingQty: number } | null;
}

export interface PrepBatchDetail extends PrepBatch {
  stockOut: StockOutDetail | null;
}

type RawPrepBatch = Omit<PrepBatch, 'batches' | 'expectedQty' | 'actualQty' | 'totalCost' | 'lot'> & {
  batches: string;
  expectedQty: string;
  actualQty: string;
  totalCost: string;
  lot: { id: number; unitCost: string; remainingQty: string } | null;
  stockOut?: RawStockOutDetail | null;
};

const toPrepBatch = (b: RawPrepBatch): PrepBatch => ({
  ...b,
  batches: Number(b.batches),
  expectedQty: Number(b.expectedQty),
  actualQty: Number(b.actualQty),
  totalCost: Number(b.totalCost),
  lot: b.lot ? { ...b.lot, unitCost: Number(b.lot.unitCost), remainingQty: Number(b.lot.remainingQty) } : null,
});

export const listPrepBatches = (params: StockListParams & { preparedId?: number }) =>
  api.get<Paged<RawPrepBatch>>('/prep-batches', { params }).then((r) => ({ ...r.data, items: r.data.items.map(toPrepBatch) }));

export const getPrepBatch = (id: number) =>
  api.get<RawPrepBatch>(`/prep-batches/${id}`).then(
    (r): PrepBatchDetail => ({
      ...toPrepBatch(r.data),
      stockOut: r.data.stockOut ? toStockOutDetail(r.data.stockOut) : null,
    }),
  );

export const createPrepBatch = (input: { preparedId: number; batches: number; actualQty?: number; note?: string }) =>
  api.post<RawPrepBatch>('/prep-batches', input).then((r) => toPrepBatch(r.data));

// ---------- Kiểm kê ----------

export interface StockCount {
  id: number;
  code: string;
  note: string | null;
  createdAt: string;
  createdBy: Creator;
  stockOut: { id: number; code: string } | null;
  increaseValue: number;
  decreaseValue: number;
  diffValue: number;
  itemCount?: number;
  diffCount?: number;
}

export interface StockCountItem {
  id: number;
  ingredient: IngredientRef;
  systemQty: number;
  actualQty: number;
  diff: number;
  unitCost: number;
}

export interface StockCountDetail extends StockCount {
  items: StockCountItem[];
}

type RawStockCount = Omit<StockCount, 'increaseValue' | 'decreaseValue' | 'diffValue'> & {
  increaseValue: string;
  decreaseValue: string;
  diffValue: string;
};

const toStockCount = (c: RawStockCount): StockCount => ({
  ...c,
  increaseValue: Number(c.increaseValue),
  decreaseValue: Number(c.decreaseValue),
  diffValue: Number(c.diffValue),
});

type RawCountItem = Omit<StockCountItem, 'systemQty' | 'actualQty' | 'diff' | 'unitCost'> &
  Record<'systemQty' | 'actualQty' | 'diff' | 'unitCost', string>;

export const listStockCounts = (params: StockListParams) =>
  api.get<Paged<RawStockCount>>('/stock-counts', { params }).then((r) => ({ ...r.data, items: r.data.items.map(toStockCount) }));

export const getStockCount = (id: number) =>
  api.get<RawStockCount & { items: RawCountItem[] }>(`/stock-counts/${id}`).then(
    (r): StockCountDetail => ({
      ...toStockCount(r.data),
      items: r.data.items.map((i) => ({
        ...i,
        systemQty: Number(i.systemQty),
        actualQty: Number(i.actualQty),
        diff: Number(i.diff),
        unitCost: Number(i.unitCost),
      })),
    }),
  );

export const createStockCount = (input: { note?: string; items: { ingredientId: number; actualQty: number }[] }) =>
  api.post<RawStockCount>('/stock-counts', input).then((r) => toStockCount(r.data));
