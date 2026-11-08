import { useEffect, useState } from 'react';
import { Flex, Input, InputNumber, Modal, Radio, Segmented, Tag, Typography } from 'antd';
import type { MenuDrink } from '../api/drinks';
import { fmtMoney } from '../utils/format';

/** Số phần tối đa của một topping trên một ly (Q7, khớp BE). */
export const MAX_TOPPING_PORTIONS = 3;

const SUGAR = ['100% đường', '70% đường', '50% đường', '30% đường', 'Không đường'];
const ICE = ['100% đá', '70% đá', '50% đá', 'Ít đá', 'Không đá'];

export interface DrinkSelection {
  drinkId: number;
  sizeId: number;
  toppings: { toppingId: number; quantity: number }[];
  quantity: number;
  note: string | null;
  /** Giá một ly đã gồm topping, chỉ để hiển thị; BE tính lại khi lưu. */
  unitPrice: number;
}

interface Props {
  drink: MenuDrink | null;
  /** Giá trị ban đầu khi sửa dòng đã chọn. */
  initial?: Partial<DrinkSelection>;
  onConfirm: (sel: DrinkSelection) => void;
  onClose: () => void;
}

/** Chọn size, topping và số phần, mức đường/đá (chỉ là ghi chú), số lượng. */
export default function DrinkOptionModal({ drink, initial, onConfirm, onClose }: Props) {
  const [sizeId, setSizeId] = useState<number>();
  const [portions, setPortions] = useState<Record<number, number>>({});
  const [sugar, setSugar] = useState(SUGAR[0]);
  const [ice, setIce] = useState(ICE[0]);
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!drink) return;
    setSizeId(initial?.sizeId ?? (drink.sizes.find((s) => s.isDefault) ?? drink.sizes[0])?.id);
    setPortions(Object.fromEntries((initial?.toppings ?? []).map((t) => [t.toppingId, t.quantity])));
    setQuantity(initial?.quantity ?? 1);
    // Ghi chú cũ dạng "50% đường, Ít đá, thêm ..." được tách lại thành preset + phần tự nhập.
    const parts = (initial?.note ?? '').split(', ').filter(Boolean);
    setSugar(parts.find((p) => SUGAR.includes(p)) ?? SUGAR[0]);
    setIce(parts.find((p) => ICE.includes(p)) ?? ICE[0]);
    setNote(parts.filter((p) => !SUGAR.includes(p) && !ICE.includes(p)).join(', '));
  }, [drink, initial]);

  if (!drink) return null;

  const size = drink.sizes.find((s) => s.id === sizeId);
  const toppings = drink.toppings
    .filter((t) => (portions[t.id] ?? 0) > 0)
    .map((t) => ({ toppingId: t.id, quantity: portions[t.id], price: t.price }));
  const unitPrice = (size?.price ?? 0) + toppings.reduce((s, t) => s + t.price * t.quantity, 0);

  const confirm = () => {
    if (!size) return;
    // Mức mặc định (100% đường, 100% đá) không ghi vào ghi chú.
    const noteText = [sugar !== SUGAR[0] && sugar, ice !== ICE[0] && ice, note.trim()].filter(Boolean).join(', ');
    onConfirm({
      drinkId: drink.id,
      sizeId: size.id,
      toppings: toppings.map(({ toppingId, quantity: q }) => ({ toppingId, quantity: q })),
      quantity,
      note: noteText || null,
      unitPrice,
    });
  };

  return (
    <Modal
      title={drink.name}
      open
      okText={`Thêm · ${fmtMoney(unitPrice * quantity)}`}
      cancelText="Hủy"
      okButtonProps={{ disabled: !size }}
      onOk={confirm}
      onCancel={onClose}
      width={520}
    >
      <Flex vertical gap={16}>
        {drink.sizes.length > 1 && (
          <div>
            <Typography.Text strong>Size</Typography.Text>
            <Radio.Group
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              style={{ display: 'flex', marginTop: 6 }}
              options={drink.sizes.map((s) => ({
                value: s.id,
                label: `${s.name} · ${fmtMoney(s.price)}${s.shortage ? ' ⚠' : ''}`,
              }))}
            />
          </div>
        )}

        {drink.toppings.length > 0 && (
          <div>
            <Typography.Text strong>Topping</Typography.Text>
            {drink.toppings.map((t) => (
              <Flex key={t.id} justify="space-between" align="center" style={{ marginTop: 6 }}>
                <span>
                  {t.name} <Typography.Text type="secondary">+{fmtMoney(t.price)}</Typography.Text>
                  {t.shortage && <Tag color="orange" style={{ marginInlineStart: 6 }}>Thiếu NL</Tag>}
                </span>
                <InputNumber
                  min={0}
                  max={MAX_TOPPING_PORTIONS}
                  precision={0}
                  value={portions[t.id] ?? 0}
                  onChange={(v) => setPortions({ ...portions, [t.id]: v ?? 0 })}
                  style={{ width: 80 }}
                />
              </Flex>
            ))}
          </div>
        )}

        <div>
          <Typography.Text strong>Mức đường</Typography.Text>
          <Segmented block value={sugar} onChange={setSugar} options={SUGAR} style={{ marginTop: 6 }} />
        </div>
        <div>
          <Typography.Text strong>Mức đá</Typography.Text>
          <Segmented block value={ice} onChange={setIce} options={ICE} style={{ marginTop: 6 }} />
        </div>
        <Input.TextArea placeholder="Ghi chú thêm" maxLength={200} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Flex justify="space-between" align="center">
          <Typography.Text strong>Số lượng</Typography.Text>
          <InputNumber min={1} max={99} precision={0} value={quantity} onChange={(v) => setQuantity(v ?? 1)} />
        </Flex>
      </Flex>
    </Modal>
  );
}
