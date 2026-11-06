import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App as AntdApp, Button, Flex, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createIngredient,
  deleteIngredient,
  getPrepRecipe,
  listIngredientCategories,
  listIngredients,
  setPrepRecipe,
  type Ingredient,
} from '../api/inventory';
import { UNIT_OPTIONS } from '../utils/units';

type FormValues = {
  name: string;
  unit: string;
  categoryId?: number | null;
  shelfLifeHours: number;
  batchYield: number;
  items: { ingredientId?: number; quantity?: number }[];
};

interface Props {
  open: boolean;
  /** Có `ing` thì chỉ sửa công thức của bán thành phẩm đó, không có thì tạo mới. */
  ing?: Ingredient;
  onClose: () => void;
  onSaved: () => void;
}

export default function PrepRecipeModal({ open, ing, onClose, onSaved }: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const editing = !!ing;

  const { data: raws } = useQuery({
    queryKey: ['ingredients', 'list', { type: 'RAW', isActive: true, all: true }],
    queryFn: () => listIngredients({ type: 'RAW', isActive: true, page: 1, pageSize: 100 }),
    enabled: open,
  });
  const { data: categories } = useQuery({
    queryKey: ['ingredient-categories'],
    queryFn: listIngredientCategories,
    enabled: open && !editing,
  });
  const { data: recipe } = useQuery({
    queryKey: ['ingredients', 'prep-recipe', ing?.id],
    queryFn: () => getPrepRecipe(ing!.id),
    enabled: open && editing,
  });

  useEffect(() => {
    if (!open) return;
    if (!ing) form.resetFields();
    else if (recipe)
      form.setFieldsValue({
        batchYield: recipe.batchYield ?? undefined,
        items: recipe.items.length ? recipe.items.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity })) : [{}],
      });
  }, [open, ing, recipe, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const items = v.items.map((i) => ({ ingredientId: i.ingredientId!, quantity: i.quantity! }));
      if (ing) return setPrepRecipe(ing.id, { batchYield: v.batchYield, items });
      const created = await createIngredient({
        name: v.name.trim(),
        unit: v.unit,
        type: 'PREPARED',
        categoryId: v.categoryId ?? null,
        minStock: 0,
        shelfLifeHours: v.shelfLifeHours,
      });
      try {
        return await setPrepRecipe(created.id, { batchYield: v.batchYield, items });
      } catch (e) {
        await deleteIngredient(created.id).catch(() => undefined); // không để lại bán thành phẩm rỗng công thức
        throw e;
      }
    },
    onSuccess: () => {
      message.success(editing ? 'Đã lưu công thức' : 'Đã tạo công thức sơ chế');
      onSaved();
      onClose();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  return (
    <Modal
      title={editing ? `Sửa công thức: ${ing!.name}` : 'Tạo công thức sơ chế'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Lưu công thức"
      cancelText="Hủy"
      confirmLoading={save.isPending}
      destroyOnHidden
      forceRender
      width={560}
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ items: [{}] }} onFinish={(v) => save.mutate(v)}>
        {!editing && (
          <>
            <Form.Item label="Tên bán thành phẩm" name="name" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên' }]}>
              <Input maxLength={100} placeholder="Ví dụ: Cốt cà phê, Trân châu nấu" />
            </Form.Item>
            <Flex gap={12}>
              <Form.Item label="Loại" name="categoryId" style={{ flex: 1 }}>
                <Select allowClear placeholder="Chưa phân loại" options={categories?.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} />
              </Form.Item>
              <Form.Item label="Đơn vị tính" name="unit" rules={[{ required: true, message: 'Chọn đơn vị' }]} style={{ width: 140 }}>
                <Select showSearch placeholder="Đơn vị" options={UNIT_OPTIONS} />
              </Form.Item>
            </Flex>
            <Form.Item label="Hạn sử dụng sau khi làm" name="shelfLifeHours" rules={[{ required: true, message: 'Nhập thời hạn' }]}>
              <InputNumber min={1} max={8760} precision={0} suffix="giờ" style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}
        <Form.Item label="Sản lượng một mẻ" name="batchYield" rules={[{ required: true, message: 'Nhập sản lượng một mẻ' }]}>
          <InputNumber min={0.001} precision={3} suffix={ing?.unit} style={{ width: 240 }} />
        </Form.Item>
        <Typography.Text strong>Nguyên liệu thô cho một mẻ</Typography.Text>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Flex key={f.key} gap={8} align="baseline" style={{ marginTop: 8 }}>
                  <Form.Item name={[f.name, 'ingredientId']} rules={[{ required: true, message: 'Chọn nguyên liệu' }]} style={{ flex: 1, marginBottom: 0 }}>
                    <Select
                      showSearch={{ optionFilterProp: 'label' }}
                      placeholder="Chọn nguyên liệu thô"
                      options={raws?.items.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` }))}
                    />
                  </Form.Item>
                  <Form.Item name={[f.name, 'quantity']} rules={[{ required: true, message: 'Nhập lượng' }]} style={{ marginBottom: 0 }}>
                    <InputNumber min={0.001} precision={3} placeholder="Lượng" style={{ width: 140 }} />
                  </Form.Item>
                  {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(f.name)} />}
                </Flex>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} style={{ marginTop: 12 }}>
                Thêm nguyên liệu
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
