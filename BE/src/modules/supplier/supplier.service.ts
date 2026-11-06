import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { CreateSupplierInput, ListSuppliersQuery, UpdateSupplierInput } from './supplier.schema.js';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const NAME_TAKEN = 'Tên nhà cung cấp đã tồn tại';

async function getOrThrow(id: number) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new AppError(404, 'Không tìm thấy nhà cung cấp');
  return supplier;
}

export async function listSuppliers(query: ListSuppliersQuery) {
  const where: Prisma.SupplierWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q.replace(/\s+/g, '') } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.supplier.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export const getSupplier = getOrThrow;

export async function createSupplier(input: CreateSupplierInput) {
  try {
    return await prisma.supplier.create({ data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

export async function updateSupplier(id: number, input: UpdateSupplierInput) {
  await getOrThrow(id);
  try {
    return await prisma.supplier.update({ where: { id }, data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

/** Xóa cứng nếu chưa có phiếu nhập, ngược lại chỉ ẩn đi. */
export async function removeSupplier(id: number) {
  await getOrThrow(id);
  if ((await prisma.stockIn.count({ where: { supplierId: id } })) > 0) {
    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.supplier.delete({ where: { id } });
  }
}
