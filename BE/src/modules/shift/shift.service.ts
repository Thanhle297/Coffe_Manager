import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type { CreateShiftInput, ListShiftsQuery, UpdateShiftInput } from './shift.schema.js';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const NAME_TAKEN = 'Tên ca đã tồn tại';

async function getOrThrow(id: number) {
  const shift = await prisma.shift.findUnique({ where: { id } });
  if (!shift) throw new AppError(404, 'Không tìm thấy ca làm');
  return shift;
}

export async function listShifts(query: ListShiftsQuery) {
  return prisma.shift.findMany({
    where: query.includeInactive ? {} : { isActive: true },
    orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
  });
}

export const getShift = getOrThrow;

export async function createShift(input: CreateShiftInput) {
  try {
    return await prisma.shift.create({ data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

/** Đổi giá ca không ảnh hưởng chấm công cũ vì mỗi dòng đã chốt `payAmount`. */
export async function updateShift(id: number, input: UpdateShiftInput) {
  const shift = await getOrThrow(id);
  if ((input.startTime ?? shift.startTime) === (input.endTime ?? shift.endTime)) {
    throw new AppError(400, 'Giờ bắt đầu và kết thúc phải khác nhau');
  }
  try {
    return await prisma.shift.update({ where: { id }, data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, NAME_TAKEN);
    throw e;
  }
}

/** Đã có chấm công: ngừng dùng. Chưa có: xóa hẳn. */
export async function removeShift(id: number) {
  await getOrThrow(id);
  const used = await prisma.attendance.count({ where: { shiftId: id } });
  if (used > 0) {
    await prisma.shift.update({ where: { id }, data: { isActive: false } });
    return { deleted: false };
  }
  await prisma.shift.delete({ where: { id } });
  return { deleted: true };
}
