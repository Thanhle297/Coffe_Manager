import { api } from './client';
import type { Paged } from './customers';

/** Ảnh lưu ở BE (`/uploads/...`), ghép với base URL của API. */
export const imageSrc = (url: string | null | undefined) => (url ? `${api.defaults.baseURL ?? ''}${url}` : undefined);

// ---------- Danh mục ----------

export interface DrinkCategory {
  id: number;
  name: string;
  sortOrder: number;
  drinkCount?: number;
}

export type DrinkCategoryInput = { name: string; sortOrder: number };

export const listDrinkCategories = () => api.get<DrinkCategory[]>('/drink-categories').then((r) => r.data);

export const createDrinkCategory = (input: DrinkCategoryInput) =>
  api.post<DrinkCategory>('/drink-categories', input).then((r) => r.data);

export const updateDrinkCategory = (id: number, input: Partial<DrinkCategoryInput>) =>
  api.patch<DrinkCategory>(`/drink-categories/${id}`, input).then((r) => r.data);

export const deleteDrinkCategory = (id: number) => api.delete(`/drink-categories/${id}`).then(() => undefined);

// ---------- Công thức ----------

export interface RecipeLine {
  ingredientId: number;
  name: string;
  unit: string;
  quantity: number;
  isActive: boolean;
  /** Chỉ Quản lý. */
  cost?: number;
}

export type RecipeInput = { ingredientId: number; quantity: number }[];

type Raw<T> = Omit<T, 'recipe'> & { recipe: (Omit<RecipeLine, 'quantity'> & { quantity: string })[] };
const toRecipe = (r: Raw<{ recipe: RecipeLine[] }>['recipe']): RecipeLine[] =>
  r.map((l) => ({ ...l, quantity: Number(l.quantity) }));

/** Giá vốn, biên lợi nhuận: chỉ có khi là Quản lý. */
interface CostInfo {
  cost?: number;
  margin?: number;
  marginPercent?: number | null;
}

// ---------- Topping ----------

export interface Topping extends CostInfo {
  id: number;
  name: string;
  price: number;
  isAvailable: boolean;
  isActive: boolean;
  drinkCount: number;
  shortage: boolean;
  hasInactiveIngredient: boolean;
  recipe: RecipeLine[];
}

export type ToppingDetail = Topping & { drinks: { id: number; name: string; categoryId: number | null }[] };
export type ToppingInput = { name: string; price: number; recipe: RecipeInput };

const toTopping = <T extends { recipe: unknown }>(t: T) =>
  ({ ...t, recipe: toRecipe(t.recipe as never) }) as unknown as T & { recipe: RecipeLine[] };

export const listToppings = (params: { q?: string; includeInactive?: boolean } = {}) =>
  api.get<Raw<Topping>[]>('/toppings', { params }).then((r) => r.data.map(toTopping) as Topping[]);

export const getTopping = (id: number) =>
  api.get<Raw<ToppingDetail>>(`/toppings/${id}`).then((r) => toTopping(r.data) as ToppingDetail);

export const createTopping = (input: ToppingInput) =>
  api.post<Raw<ToppingDetail>>('/toppings', input).then((r) => toTopping(r.data) as ToppingDetail);

export const updateTopping = (id: number, input: Partial<ToppingInput>) =>
  api.put<Raw<ToppingDetail>>(`/toppings/${id}`, input).then((r) => toTopping(r.data) as ToppingDetail);

export const setToppingDrinks = (id: number, drinkIds: number[]) =>
  api.put(`/toppings/${id}/drinks`, { drinkIds }).then(() => undefined);

export const setToppingAvailability = (id: number, isAvailable: boolean) =>
  api.patch(`/toppings/${id}/availability`, { isAvailable }).then(() => undefined);

export const deleteTopping = (id: number) => api.delete(`/toppings/${id}`).then(() => undefined);

// ---------- Đồ uống ----------

export interface DrinkSize extends CostInfo {
  id: number;
  name: string;
  price: number;
  sortOrder: number;
  isDefault: boolean;
  shortage: boolean;
  recipe?: RecipeLine[];
}

export interface Drink {
  id: number;
  name: string;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  imageUrl: string | null;
  description: string | null;
  isAvailable: boolean;
  isActive: boolean;
  sizes: DrinkSize[];
  minPrice: number | null;
  maxPrice: number | null;
  missingRecipe: boolean;
  shortage: boolean;
  hasInactiveIngredient: boolean;
}

export type DrinkDetail = Drink & {
  sizes: (DrinkSize & { recipe: RecipeLine[] })[];
  toppings: { id: number; name: string; price: number; isAvailable: boolean }[];
};

export interface SizeInput {
  id?: number;
  name: string;
  price: number;
  sortOrder?: number;
  isDefault: boolean;
  recipe: RecipeInput;
}

export interface DrinkInput {
  name: string;
  categoryId: number | null;
  description: string | null;
  sizes: SizeInput[];
  toppingIds: number[];
}

export interface DrinkListParams {
  q?: string;
  categoryId?: number | 'none';
  isAvailable?: boolean;
  includeInactive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

const toDrink = <T extends { sizes: { recipe?: unknown }[] }>(d: T) =>
  ({ ...d, sizes: d.sizes.map((s) => (s.recipe ? { ...s, recipe: toRecipe(s.recipe as never) } : s)) }) as T;

export const listDrinks = (params: DrinkListParams) =>
  api.get<Paged<Drink>>('/drinks', { params }).then((r) => r.data);

export const getDrink = (id: number) => api.get<DrinkDetail>(`/drinks/${id}`).then((r) => toDrink(r.data));

export const createDrink = (input: DrinkInput) => api.post<DrinkDetail>('/drinks', input).then((r) => toDrink(r.data));

/** Lưu thông tin; kèm `sizes` / `toppingIds` thì BE lưu tất cả trong một giao dịch. */
export const updateDrink = (id: number, input: Partial<DrinkInput>) =>
  api.put<DrinkDetail>(`/drinks/${id}`, input).then((r) => toDrink(r.data));

export const saveDrinkSizes = (id: number, sizes: SizeInput[]) =>
  api.put<DrinkDetail>(`/drinks/${id}/sizes`, { sizes }).then((r) => toDrink(r.data));

export const setDrinkToppings = (id: number, toppingIds: number[]) =>
  api.put(`/drinks/${id}/toppings`, { toppingIds }).then(() => undefined);

export const setDrinkAvailability = (id: number, isAvailable: boolean) =>
  api.patch(`/drinks/${id}/availability`, { isAvailable }).then(() => undefined);

export const uploadDrinkImage = (id: number, file: File) => {
  const body = new FormData();
  body.append('image', file);
  return api.post(`/drinks/${id}/image`, body).then(() => undefined);
};

export const deleteDrink = (id: number) => api.delete(`/drinks/${id}`).then(() => undefined);

// ---------- Thực đơn bán hàng (POS) ----------

export interface MenuDrink {
  id: number;
  name: string;
  categoryId: number | null;
  imageUrl: string | null;
  description: string | null;
  sizes: { id: number; name: string; price: number; isDefault: boolean; shortage: boolean }[];
  toppings: { id: number; name: string; price: number; shortage: boolean }[];
  shortage: boolean;
}

export interface Menu {
  categories: { id: number; name: string }[];
  drinks: MenuDrink[];
}

export const getMenu = () => api.get<Menu>('/drinks/menu').then((r) => r.data);

/** "29k", "29,5k" */
export const fmtK = (n: number) => `${(n / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;

export const fmtPriceRange = (min: number | null, max: number | null) =>
  min == null ? '—' : min === max ? fmtK(min) : `${fmtK(min)} – ${fmtK(max!)}`;
