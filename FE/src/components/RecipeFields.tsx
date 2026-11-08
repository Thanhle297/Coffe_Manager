import { Button, Flex, Form, InputNumber, Select, Typography } from 'antd';
import type { FormListFieldData } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { Ingredient } from '../api/inventory';
import { fmtMoney } from '../utils/format';

export type RecipeFormLine = { ingredientId?: number; quantity?: number };

/** Giá vốn theo avgCost hiện tại của nguyên liệu. */
export const recipeCostOf = (lines: RecipeFormLine[] | undefined, byId: Map<number, Ingredient>) =>
  (lines ?? []).reduce((s, l) => s + (l.quantity ?? 0) * (byId.get(l.ingredientId ?? 0)?.avgCost ?? 0), 0);

export const toRecipeInput = (lines: RecipeFormLine[] | undefined) =>
  (lines ?? []).map((l) => ({ ingredientId: l.ingredientId!, quantity: l.quantity! }));

interface Props {
  /** Đường dẫn Form.List, ví dụ `'recipe'` hoặc `[field.name, 'recipe']`. */
  name: string | (string | number)[];
  ingredients: Ingredient[] | undefined;
  max: number;
  /** Đường dẫn tuyệt đối để đọc dòng đang nhập (cần khi Form.List lồng trong Form.List khác). */
  fullPath?: (string | number)[];
  showCost?: boolean;
  price?: number;
  /** Nguyên liệu đã ngừng dùng nhưng còn trong công thức đang sửa: hiện đúng tên và báo phải thay (PB-04). */
  inactive?: { id: number; name: string; unit: string }[];
}

/** Bảng công thức: chọn nguyên liệu, nhập định lượng theo đơn vị gốc. */
export default function RecipeFields({ name, ingredients, max, fullPath, showCost, price, inactive = [] }: Props) {
  const form = Form.useFormInstance();
  const path = fullPath ?? (Array.isArray(name) ? name : [name]);
  const lines = Form.useWatch(path, form) as RecipeFormLine[] | undefined;
  const byId = new Map((ingredients ?? []).map((i) => [i.id, i]));
  const picked = new Set((lines ?? []).map((l) => l?.ingredientId));
  const cost = recipeCostOf(lines, byId);
  const inactiveIds = new Set(inactive.map((i) => i.id));

  return (
    <Form.List
      name={name}
      rules={[
        {
          validator: async (_, v: unknown[]) => {
            if (!v || v.length === 0) throw new Error('Công thức phải có ít nhất một nguyên liệu');
          },
        },
      ]}
    >
      {(fields: FormListFieldData[], { add, remove }, { errors }) => (
        <>
          {fields.map((f) => {
            const ing = byId.get(lines?.[f.name]?.ingredientId ?? 0);
            return (
              <Flex key={f.key} gap={8} align="baseline" style={{ marginTop: 8 }}>
                <Form.Item
                  name={[f.name, 'ingredientId']}
                  rules={[
                    { required: true, message: 'Chọn nguyên liệu' },
                    {
                      validator: async (_, v: number | undefined) => {
                        if (v != null && inactiveIds.has(v)) throw new Error('Nguyên liệu đã ngừng dùng, hãy thay');
                      },
                    },
                  ]}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Select
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder="Chọn nguyên liệu"
                    options={[
                      ...(ingredients ?? []).map((i) => ({
                        value: i.id,
                        label: `${i.name} (${i.unit})${i.type === 'PREPARED' ? ' · bán thành phẩm' : ''}`,
                        disabled: picked.has(i.id) && lines?.[f.name]?.ingredientId !== i.id,
                      })),
                      ...inactive.map((i) => ({ value: i.id, label: `${i.name} (${i.unit}) · ngừng dùng`, disabled: true })),
                    ]}
                  />
                </Form.Item>
                <Form.Item name={[f.name, 'quantity']} rules={[{ required: true, message: 'Nhập lượng' }]} style={{ marginBottom: 0 }}>
                  <InputNumber min={0.001} precision={3} placeholder="Lượng" suffix={ing?.unit} style={{ width: 150 }} />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(f.name)} aria-label="Xóa dòng" />
              </Flex>
            );
          })}
          <Form.ErrorList errors={errors} />
          <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
            <Button type="dashed" size="small" icon={<PlusOutlined />} disabled={fields.length >= max} onClick={() => add()}>
              Thêm nguyên liệu
            </Button>
            {showCost && (
              <Typography.Text type="secondary">
                Giá vốn: <b>{fmtMoney(cost)}</b>
                {price != null && price > 0 && (
                  <>
                    {' · '}Lãi: <b>{fmtMoney(price - cost)}</b> ({Math.round(((price - cost) / price) * 100)}%)
                  </>
                )}
              </Typography.Text>
            )}
          </Flex>
        </>
      )}
    </Form.List>
  );
}
