import { z } from 'zod';

const posInt = (msg: string) => z.number({ error: msg }).int(msg).positive(msg);

export const updateLoyaltySchema = z
  .object({
    amountPerPoint: posInt('Số tiền để được 1 điểm phải là số nguyên dương'),
    pointValue: posInt('Giá trị 1 điểm phải là số nguyên dương'),
    maxRedeemPercent: z
      .number({ error: 'Tỷ lệ giảm tối đa không hợp lệ' })
      .int('Tỷ lệ giảm tối đa không hợp lệ')
      .min(0, 'Tỷ lệ giảm tối đa từ 0 đến 100')
      .max(100, 'Tỷ lệ giảm tối đa từ 0 đến 100'),
    minRedeemPoints: z
      .number({ error: 'Số điểm đổi tối thiểu không hợp lệ' })
      .int('Số điểm đổi tối thiểu không hợp lệ')
      .min(0, 'Số điểm đổi tối thiểu không được âm'),
    isEnabled: z.boolean({ error: 'Trạng thái không hợp lệ' }),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có thay đổi nào để cập nhật' });

export type UpdateLoyaltyInput = z.infer<typeof updateLoyaltySchema>;
