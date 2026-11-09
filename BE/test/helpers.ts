import request from 'supertest';
import { app } from '../src/app.js';
import { Role } from '../src/generated/prisma/enums.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

export const api = () => request(app);

export async function resetDb() {
  await prisma.attendance.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.order.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.stockOutAllocation.deleteMany();
  await prisma.stockOutItem.deleteMany();
  await prisma.stockOut.deleteMany();
  await prisma.stockLot.deleteMany();
  await prisma.stockCountItem.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.prepBatch.deleteMany();
  await prisma.stockInItem.deleteMany();
  await prisma.stockIn.deleteMany();
  await prisma.drink.deleteMany();
  await prisma.topping.deleteMany();
  await prisma.drinkCategory.deleteMany();
  await prisma.prepRecipeItem.deleteMany();
  await prisma.purchaseUnit.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.ingredientCategory.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.pointLog.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.customerType.deleteMany();
  await prisma.loyaltySetting.deleteMany();
  await prisma.loginLog.deleteMany();
  await prisma.account.deleteMany();
}

export async function createAccount(
  username: string,
  password: string,
  data: { role?: Role; isActive?: boolean; mustChangePassword?: boolean } = {},
) {
  return prisma.account.create({
    data: {
      username,
      fullName: username,
      passwordHash: await hashPassword(password),
      role: data.role ?? Role.STAFF,
      isActive: data.isActive ?? true,
      mustChangePassword: data.mustChangePassword ?? false,
    },
  });
}

export async function loginAs(username: string, password: string): Promise<string> {
  const res = await api().post('/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`Đăng nhập thất bại: ${res.status} ${res.text}`);
  return res.body.token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function seedTiers() {
  await prisma.customerType.createMany({
    data: [
      { name: 'Thường', minPoints: 0, discountPercent: 0 },
      { name: 'Bạc', minPoints: 100, discountPercent: 5 },
      { name: 'Vàng', minPoints: 300, discountPercent: 10 },
    ],
  });
}
