import 'dotenv/config';
import { IngredientType, Role } from '../src/generated/prisma/enums.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const DEFAULT_TIERS = [
  { name: 'Thường', minPoints: 0, discountPercent: 0 },
  { name: 'Bạc', minPoints: 100, discountPercent: 5 },
  { name: 'Vàng', minPoints: 300, discountPercent: 10 },
  { name: 'Kim cương', minPoints: 600, discountPercent: 15 },
];

async function seedLoyalty() {
  await prisma.loyaltySetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if ((await prisma.customerType.count()) === 0) {
    await prisma.customerType.createMany({ data: DEFAULT_TIERS });
    console.log('Đã tạo 4 loại khách hàng mặc định.');
  }
}

const DEFAULT_CATEGORIES = [
  { name: 'Cà phê', icon: '☕' },
  { name: 'Trà', icon: '🍵' },
  { name: 'Sữa', icon: '🥛' },
  { name: 'Đường, siro', icon: '🍯' },
  { name: 'Trái cây', icon: '🍓' },
  { name: 'Topping', icon: '🧋' },
  { name: 'Bao bì', icon: '🥤' },
];

const DEFAULT_INGREDIENTS = [
  { name: 'Cà phê hạt', unit: 'g', minStock: 2000, category: 'Cà phê' },
  { name: 'Sữa tươi', unit: 'hộp', minStock: 5, category: 'Sữa' },
  { name: 'Sữa đặc', unit: 'lon', minStock: 10, category: 'Sữa' },
  { name: 'Đường', unit: 'g', minStock: 2000, category: 'Đường, siro' },
  { name: 'Trà đen', unit: 'g', minStock: 500, category: 'Trà' },
  { name: 'Ly nhựa', unit: 'cái', minStock: 100, category: 'Bao bì' },
];

/** Quy cách mua: [tên, hệ số ra đơn vị gốc]. */
const PURCHASE_UNITS: Record<string, [string, number][]> = {
  'Cà phê hạt': [['Bao 1 kg', 1000], ['Bao 500 g', 500]],
  'Sữa tươi': [['Thùng 12 hộp', 12]],
  'Sữa đặc': [['Thùng 24 lon', 24]],
  'Đường': [['Bao 1 kg', 1000], ['Bao 50 kg', 50000]],
  'Trà đen': [['Gói 500 g', 500]],
  'Ly nhựa': [['Cây 50 ly', 50], ['Thùng 1000 ly', 1000]],
  'Bột năng': [['Gói 1 kg', 1000]],
};

/** Bán thành phẩm mẫu kèm định mức một mẻ. */
const PREPARED = [
  {
    name: 'Cốt cà phê phin', unit: 'ml', category: 'Cà phê', shelfLifeHours: 24, batchYield: 1500, minStock: 1000,
    items: [['Cà phê hạt', 500]] as [string, number][],
  },
  {
    name: 'Trân châu đen', unit: 'g', category: 'Topping', shelfLifeHours: 4, batchYield: 1200, minStock: 300,
    items: [['Bột năng', 500], ['Đường', 200]] as [string, number][],
  },
  {
    name: 'Trà đen ủ', unit: 'ml', category: 'Trà', shelfLifeHours: 8, batchYield: 2000, minStock: 500,
    items: [['Trà đen', 40]] as [string, number][],
  },
  {
    name: 'Siro đường', unit: 'ml', category: 'Đường, siro', shelfLifeHours: 168, batchYield: 1500, minStock: 300,
    items: [['Đường', 1000]] as [string, number][],
  },
];

async function seedLotsAndPrep(categoryId: Map<string, number>) {
  // Nguyên liệu thô bổ sung cho định mức mẫu.
  await prisma.ingredient.upsert({
    where: { name: 'Bột năng' },
    update: {},
    create: { name: 'Bột năng', unit: 'g', minStock: 1000, categoryId: categoryId.get('Topping') },
  });
  const ids = new Map((await prisma.ingredient.findMany()).map((i) => [i.name, i.id] as const));

  // Chỉ tạo quy cách cho nguyên liệu mẫu chưa có quy cách nào.
  const hasUnits = new Set((await prisma.purchaseUnit.findMany({ select: { ingredientId: true } })).map((u) => u.ingredientId));
  const data = Object.entries(PURCHASE_UNITS).flatMap(([name, units]) => {
    const id = ids.get(name);
    return id && !hasUnits.has(id) ? units.map(([unitName, factor]) => ({ ingredientId: id, name: unitName, factor })) : [];
  });
  if (data.length > 0) {
    await prisma.purchaseUnit.createMany({ data });
    console.log(`Đã tạo ${data.length} quy cách mua mẫu.`);
  }

  for (const { items, category, ...p } of PREPARED) {
    if (ids.has(p.name)) continue;
    const created = await prisma.ingredient.create({
      data: { ...p, type: IngredientType.PREPARED, categoryId: categoryId.get(category) },
    });
    await prisma.prepRecipeItem.createMany({
      data: items.map(([name, quantity]) => ({ preparedId: created.id, ingredientId: ids.get(name)!, quantity })),
    });
    console.log(`Đã tạo bán thành phẩm mẫu: ${p.name}`);
  }
}

/**
 * Sữa quản lý theo hộp/lon cho dễ đếm. DB seed trước đó dùng ml/g: đổi đơn vị và thay quy cách,
 * chỉ khi nguyên liệu chưa có lô nào (đã có tồn thì đổi sẽ làm sai số liệu).
 */
async function migrateMilkUnits() {
  const target: Record<string, { unit: string; minStock: number }> = {
    'Sữa tươi': { unit: 'hộp', minStock: 5 },
    'Sữa đặc': { unit: 'lon', minStock: 10 },
  };
  for (const [name, t] of Object.entries(target)) {
    const ing = await prisma.ingredient.findUnique({ where: { name } });
    if (!ing || ing.unit === t.unit) continue;
    if ((await prisma.stockLot.count({ where: { ingredientId: ing.id } })) > 0) {
      console.log(`Bỏ qua đổi đơn vị ${name}: đã có lô hàng.`);
      continue;
    }
    await prisma.$transaction([
      prisma.purchaseUnit.deleteMany({ where: { ingredientId: ing.id } }),
      prisma.ingredient.update({ where: { id: ing.id }, data: t }),
      prisma.purchaseUnit.createMany({
        data: PURCHASE_UNITS[name].map(([unitName, factor]) => ({ ingredientId: ing.id, name: unitName, factor })),
      }),
    ]);
    console.log(`Đã đổi đơn vị ${name} sang ${t.unit}.`);
  }
}

async function seedInventory() {
  if ((await prisma.ingredientCategory.count()) === 0) {
    await prisma.ingredientCategory.createMany({ data: DEFAULT_CATEGORIES });
    console.log(`Đã tạo ${DEFAULT_CATEGORIES.length} loại nguyên liệu mặc định.`);
  }
  const categoryId = new Map(
    (await prisma.ingredientCategory.findMany()).map((c) => [c.name, c.id] as const),
  );

  if ((await prisma.ingredient.count()) === 0) {
    await prisma.ingredient.createMany({
      data: DEFAULT_INGREDIENTS.map(({ category, ...i }) => ({ ...i, categoryId: categoryId.get(category) })),
    });
    console.log(`Đã tạo ${DEFAULT_INGREDIENTS.length} nguyên liệu mẫu.`);
  } else {
    await migrateMilkUnits();
    // DB đã seed trước khi có phân loại: gán loại cho nguyên liệu mẫu chưa phân loại.
    for (const { name, category } of DEFAULT_INGREDIENTS) {
      await prisma.ingredient.updateMany({
        where: { name, categoryId: null },
        data: { categoryId: categoryId.get(category) },
      });
    }
  }
  if ((await prisma.supplier.count()) === 0) {
    await prisma.supplier.createMany({
      data: [
        { name: 'Công ty Cà phê Tây Nguyên', phone: '0901000001', address: 'Buôn Ma Thuột, Đắk Lắk' },
        { name: 'Đại lý Sữa Việt', phone: '0901000002', address: 'Quận 1, TP. Hồ Chí Minh' },
      ],
    });
    console.log('Đã tạo 2 nhà cung cấp mẫu.');
  }
  await seedLotsAndPrep(categoryId);
}

const DRINK_CATEGORIES = ['Cà phê', 'Trà', 'Trà sữa'];

type SeedSize = [name: string, price: number, recipe: [string, number][]];
/** Món mẫu: công thức khớp nguyên liệu đã seed. Size đầu tiên là mặc định. */
const DRINKS: { name: string; category: string; sizes: SeedSize[]; toppings?: string[] }[] = [
  {
    name: 'Cà phê đen',
    category: 'Cà phê',
    sizes: [
      ['S', 25000, [['Cốt cà phê phin', 30], ['Siro đường', 10], ['Ly nhựa', 1]]],
      ['M', 29000, [['Cốt cà phê phin', 40], ['Siro đường', 15], ['Ly nhựa', 1]]],
      ['L', 35000, [['Cốt cà phê phin', 50], ['Siro đường', 20], ['Ly nhựa', 1]]],
    ],
  },
  {
    name: 'Cà phê sữa',
    category: 'Cà phê',
    sizes: [
      ['S', 29000, [['Cốt cà phê phin', 30], ['Sữa đặc', 0.08], ['Ly nhựa', 1]]],
      ['M', 35000, [['Cốt cà phê phin', 40], ['Sữa đặc', 0.1], ['Ly nhựa', 1]]],
    ],
  },
  {
    name: 'Trà đen',
    category: 'Trà',
    sizes: [['Tiêu chuẩn', 25000, [['Trà đen ủ', 200], ['Siro đường', 20], ['Ly nhựa', 1]]]],
    toppings: ['Trân châu đen'],
  },
  {
    name: 'Trà sữa trân châu',
    category: 'Trà sữa',
    sizes: [
      ['M', 35000, [['Trà đen ủ', 150], ['Sữa tươi', 0.1], ['Siro đường', 20], ['Trân châu đen', 40], ['Ly nhựa', 1]]],
      ['L', 42000, [['Trà đen ủ', 200], ['Sữa tươi', 0.15], ['Siro đường', 25], ['Trân châu đen', 50], ['Ly nhựa', 1]]],
    ],
    toppings: ['Trân châu đen'],
  },
];

async function seedDrinks() {
  if ((await prisma.drinkCategory.count()) > 0 || (await prisma.drink.count()) > 0) return;
  const ing = new Map((await prisma.ingredient.findMany()).map((i) => [i.name, i.id] as const));
  const recipe = (items: [string, number][]) =>
    items.filter(([n]) => ing.has(n)).map(([n, quantity]) => ({ ingredientId: ing.get(n)!, quantity }));

  await prisma.drinkCategory.createMany({ data: DRINK_CATEGORIES.map((name, sortOrder) => ({ name, sortOrder })) });
  const cat = new Map((await prisma.drinkCategory.findMany()).map((c) => [c.name, c.id] as const));

  const topping = await prisma.topping.create({
    data: { name: 'Trân châu đen', price: 8000, recipe: { create: recipe([['Trân châu đen', 50]]) } },
  });
  for (const d of DRINKS) {
    await prisma.drink.create({
      data: {
        name: d.name,
        categoryId: cat.get(d.category),
        isAvailable: true,
        sizes: {
          create: d.sizes.map(([name, price, items], i) => ({
            name,
            price,
            sortOrder: i,
            isDefault: i === 0,
            recipe: { create: recipe(items) },
          })),
        },
        toppings: { create: (d.toppings ?? []).map(() => ({ toppingId: topping.id })) },
      },
    });
  }
  console.log(`Đã tạo ${DRINK_CATEGORIES.length} danh mục, 1 topping và ${DRINKS.length} đồ uống mẫu.`);
}

/** Bàn mẫu: Bàn 1..10. */
async function seedTables() {
  for (let i = 1; i <= 10; i++) {
    await prisma.diningTable.upsert({
      where: { name: `Bàn ${i}` },
      update: {},
      create: { name: `Bàn ${i}`, floor: i <= 6 ? 1 : 2, seats: i <= 6 ? 4 : 2, sortOrder: i },
    });
  }
  console.log('Đã có 10 bàn mẫu.');
}

async function main() {
  await seedLoyalty();
  await seedInventory();
  await seedDrinks();
  await seedTables();

  const existing = await prisma.account.count({ where: { role: Role.MANAGER } });
  if (existing > 0) {
    console.log('Đã có tài khoản Quản lý, bỏ qua seed.');
    return;
  }

  const username = (process.env.SEED_MANAGER_USERNAME ?? 'admin').toLowerCase();
  const password = process.env.SEED_MANAGER_PASSWORD ?? 'Admin@12345';

  await prisma.account.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      fullName: 'Quản lý',
      role: Role.MANAGER,
      mustChangePassword: true,
    },
  });
  console.log(`Đã tạo Quản lý đầu tiên: ${username} (bắt buộc đổi mật khẩu khi đăng nhập lần đầu)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
