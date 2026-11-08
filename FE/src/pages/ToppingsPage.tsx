import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { fetchAllPages, getErrorMessage } from '../api/client';
import {
  createTopping,
  deleteTopping,
  getTopping,
  listDrinkCategories,
  listDrinks,
  listToppings,
  setToppingAvailability,
  setToppingDrinks,
  updateTopping,
  type Topping,
} from '../api/drinks';
import { listIngredients } from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import EmptyHint from '../components/EmptyHint';
import RecipeFields, { toRecipeInput, type RecipeFormLine } from '../components/RecipeFields';
import { fmtMoney } from '../utils/format';

type FormValues = { name: string; price: number; recipe: RecipeFormLine[] };

export default function ToppingsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Topping | 'new' | null>(null);
  const [assigning, setAssigning] = useState<Topping | null>(null);
  const [form] = Form.useForm<FormValues>();
  const price = Form.useWatch('price', form);

  const { data, isLoading } = useQuery({ queryKey: ['toppings', { q }], queryFn: () => listToppings({ q: q || undefined }) });
  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', 'list', { isActive: true, all: true }],
    queryFn: () => fetchAllPages((page) => listIngredients({ isActive: true, page, pageSize: 100 })),
    enabled: editing !== null,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['toppings'] });
    queryClient.invalidateQueries({ queryKey: ['drinks'] });
  };
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const inactive =
    editing && editing !== 'new'
      ? editing.recipe.filter((r) => !r.isActive).map((r) => ({ id: r.ingredientId, name: r.name, unit: r.unit }))
      : [];

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const input = { name: v.name.trim(), price: v.price, recipe: toRecipeInput(v.recipe) };
      if (!editing || editing === 'new') return createTopping(input);
      // Công thức không đổi thì không gửi, để sửa tên/giá vẫn lưu được khi còn nguyên liệu ngừng dùng (PB-04).
      const oldRecipe = toRecipeInput(editing.recipe.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })));
      const recipeChanged = JSON.stringify(input.recipe) !== JSON.stringify(oldRecipe);
      return updateTopping(editing.id, { name: input.name, price: input.price, ...(recipeChanged ? { recipe: input.recipe } : {}) });
    },
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm topping' : 'Đã cập nhật topping');
      setEditing(null);
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => setToppingAvailability(id, on),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: deleteTopping,
    onSuccess: () => {
      message.success('Đã xóa topping');
      refresh();
    },
    onError,
  });

  const openEditor = (t: Topping | 'new') => {
    form.resetFields();
    form.setFieldsValue(
      t === 'new'
        ? { name: '', price: 5000, recipe: [{}] }
        : { name: t.name, price: t.price, recipe: t.recipe.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })) },
    );
    setEditing(t);
  };

  const columns: TableProps<Topping>['columns'] = [
    {
      title: 'Topping',
      dataIndex: 'name',
      render: (v: string, t) => (
        <Space size={4} wrap>
          <Typography.Text strong>{v}</Typography.Text>
          {t.shortage && <Tag color="orange">Thiếu nguyên liệu</Tag>}
          {t.hasInactiveIngredient && <Tag color="volcano">Nguyên liệu ngừng dùng</Tag>}
        </Space>
      ),
    },
    {
      title: 'Công thức (1 phần)',
      render: (_, t) => (
        <Typography.Text type="secondary">{t.recipe.map((r) => `${r.name} ${r.quantity} ${r.unit}`).join(', ')}</Typography.Text>
      ),
    },
    { title: 'Giá', dataIndex: 'price', width: 110, align: 'right', render: fmtMoney },
    ...(isManager
      ? [{ title: 'Giá vốn', dataIndex: 'cost', width: 110, align: 'right' as const, render: fmtMoney }]
      : []),
    { title: 'Số món', dataIndex: 'drinkCount', width: 90, align: 'right' },
    {
      title: 'Đang bán',
      dataIndex: 'isAvailable',
      width: 100,
      render: (v: boolean, t) => (
        <Switch
          checked={v}
          disabled={!isManager}
          loading={toggle.isPending && toggle.variables?.id === t.id}
          onChange={(on) => toggle.mutate({ id: t.id, on })}
        />
      ),
    },
    ...(isManager
      ? [
          {
            title: 'Thao tác',
            width: 230,
            render: (_: unknown, t: Topping) => (
              <Flex gap={8}>
                <Button size="small" onClick={() => openEditor(t)}>
                  Sửa
                </Button>
                <Button size="small" onClick={() => setAssigning(t)}>
                  Gán cho món
                </Button>
                <Popconfirm
                  title="Xóa topping này?"
                  okText="Xóa"
                  okButtonProps={{ danger: true }}
                  cancelText="Hủy"
                  onConfirm={() => remove.mutate(t.id)}
                >
                  <Button size="small" danger>
                    Xóa
                  </Button>
                </Popconfirm>
              </Flex>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="Topping"
      extra={
        <Flex gap={8}>
          <Input.Search allowClear placeholder="Tìm topping" onSearch={setQ} style={{ width: 220 }} />
          {isManager && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
              Thêm topping
            </Button>
          )}
        </Flex>
      }
    >
      <Table<Topping>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={false}
        locale={{
          emptyText: (
            <EmptyHint filtered={!!q} noun="topping" actionLabel="Thêm topping" onAction={isManager ? () => openEditor('new') : undefined} />
          ),
        }}
      />

      <Modal
        title={editing === 'new' ? 'Thêm topping' : 'Sửa topping'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
        width={600}
      >
        <Form<FormValues> form={form} layout="vertical" requiredMark={false} onFinish={(v) => save.mutate(v)}>
          <Flex gap={12}>
            <Form.Item label="Tên topping" name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên topping' }]} style={{ flex: 1 }}>
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item label="Giá một phần" name="price" rules={[{ required: true, message: 'Nhập giá' }]}>
              <InputNumber min={0} max={10_000_000} step={1000} precision={0} suffix="₫" style={{ width: 160 }} />
            </Form.Item>
          </Flex>
          <Typography.Text strong>Công thức một phần</Typography.Text>
          <RecipeFields name="recipe" ingredients={ingredients} inactive={inactive} max={10} showCost={isManager} price={price} />
        </Form>
      </Modal>

      <AssignModal topping={assigning} onClose={() => setAssigning(null)} onSaved={refresh} />
    </Card>
  );
}

/** Gán topping cho nhiều món, có chọn nhanh cả danh mục. */
function AssignModal({ topping, onClose, onSaved }: { topping: Topping | null; onClose: () => void; onSaved: () => void }) {
  const { message } = AntdApp.useApp();
  const open = !!topping;
  const [selected, setSelected] = useState<number[]>([]);

  const { data: detail, isFetching } = useQuery({
    queryKey: ['toppings', 'detail', topping?.id],
    queryFn: () => getTopping(topping!.id),
    enabled: open,
  });
  const { data: drinks } = useQuery({
    queryKey: ['drinks', 'list', { all: true }],
    queryFn: () => fetchAllPages((page) => listDrinks({ page, pageSize: 100 })),
    enabled: open,
  });
  const { data: categories } = useQuery({ queryKey: ['drink-categories'], queryFn: listDrinkCategories, enabled: open });

  useEffect(() => {
    if (detail) setSelected(detail.drinks.map((d) => d.id));
  }, [detail]);

  const save = useMutation({
    mutationFn: () => setToppingDrinks(topping!.id, selected),
    onSuccess: () => {
      message.success('Đã cập nhật món được chọn topping');
      onSaved();
      onClose();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const groups = [
    ...(categories ?? []).map((c) => ({ key: String(c.id), title: c.name, items: drinks?.filter((d) => d.categoryId === c.id) ?? [] })),
    { key: 'none', title: 'Chưa phân loại', items: drinks?.filter((d) => d.categoryId == null) ?? [] },
  ].filter((g) => g.items.length > 0);

  const sel = new Set(selected);
  const setGroup = (ids: number[], on: boolean) =>
    setSelected(on ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)));

  return (
    <Modal
      title={`Gán "${topping?.name ?? ''}" cho món`}
      open={open}
      okText="Lưu"
      cancelText="Hủy"
      confirmLoading={save.isPending}
      onOk={() => save.mutate()}
      onCancel={onClose}
      destroyOnHidden
      width={560}
    >
      <Spin spinning={isFetching}>
        {groups.length === 0 && <Typography.Text type="secondary">Chưa có món nào</Typography.Text>}
        {groups.map((g) => {
          const ids = g.items.map((d) => d.id);
          const count = ids.filter((id) => sel.has(id)).length;
          return (
            <div key={g.key} style={{ marginBottom: 12 }}>
              <Checkbox
                checked={count === ids.length}
                indeterminate={count > 0 && count < ids.length}
                onChange={(e) => setGroup(ids, e.target.checked)}
              >
                <b>{g.title}</b>
              </Checkbox>
              <Flex wrap gap={8} style={{ margin: '6px 0 0 24px' }}>
                {g.items.map((d) => (
                  <Checkbox key={d.id} checked={sel.has(d.id)} onChange={(e) => setGroup([d.id], e.target.checked)}>
                    {d.name}
                  </Checkbox>
                ))}
              </Flex>
            </div>
          );
        })}
      </Spin>
    </Modal>
  );
}
