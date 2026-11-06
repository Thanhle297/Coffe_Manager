import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createIngredient,
  DEFAULT_INGREDIENT_ICON,
  deleteIngredient,
  listIngredientCategories,
  listIngredients,
  ingredientTypeLabel,
  updateIngredient,
  type Ingredient,
  type IngredientInput,
  type IngredientType,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import IngredientDrawer from '../components/IngredientDrawer';
import { UNIT_OPTIONS } from '../utils/units';
import { expiryState, fmtDateTime, fmtNum, fmtPacks, fmtRemaining, fmtUnitPrice } from '../utils/format';
import { colors } from '../theme';
import EmptyHint from '../components/EmptyHint';

const PAGE_SIZE = 10;
type StatusFilter = 'active' | 'inactive' | 'all';

function StatusTags({ i }: { i: Ingredient }) {
  if (!i.isActive) return <Tag>Đã ẩn</Tag>;
  const state = expiryState(i.nextExpiresAt, i.type);
  return (
    <>
      {i.type === 'PREPARED' && <Tag color="purple">Bán thành phẩm</Tag>}
      {i.minStock > 0 && i.usableQty <= i.minStock && <Tag color="red">Sắp hết</Tag>}
      {i.quantity > i.usableQty && <Tag color="volcano">Có lô hết hạn</Tag>}
      {state === 'EXPIRING' && <Tag color="orange">Sắp hết hạn</Tag>}
    </>
  );
}

type FormValues = Omit<IngredientInput, 'shelfLifeHours'> & { shelfLifeHours?: number | null };


export default function IngredientsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [categoryId, setCategoryId] = useState<number | 'none'>();
  const [type, setType] = useState<IngredientType>();
  const [viewing, setViewing] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();
  const formType = Form.useWatch('type', form);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const isActive = status === 'all' ? undefined : status === 'active';
  const { data, isLoading } = useQuery({
    queryKey: ['ingredients', 'list', { q, isActive, categoryId, type, page }],
    queryFn: () => listIngredients({ q: q || undefined, isActive, categoryId, type, page, pageSize: PAGE_SIZE }),
  });
  const { data: categories } = useQuery({ queryKey: ['ingredient-categories'], queryFn: listIngredientCategories });
  const categoryOptions = categories?.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ingredients'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (values: IngredientInput) =>
      editing && editing !== 'new' ? updateIngredient(editing.id, values) : createIngredient(values),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm nguyên liệu' : 'Đã cập nhật nguyên liệu');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIngredient,
    onSuccess: () => {
      message.success('Đã xóa nguyên liệu');
      refresh();
    },
    onError,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => updateIngredient(id, { isActive: true }),
    onSuccess: () => {
      message.success('Đã kích hoạt lại nguyên liệu');
      refresh();
    },
    onError,
  });

  const openEditor = (ingredient: Ingredient | 'new') => {
    form.resetFields();
    if (ingredient !== 'new') {
      form.setFieldsValue({
        name: ingredient.name,
        unit: ingredient.unit,
        type: ingredient.type,
        categoryId: ingredient.categoryId,
        minStock: ingredient.minStock,
        shelfLifeHours: ingredient.shelfLifeHours,
      });
    }
    setEditing(ingredient);
  };

  const columns: TableProps<Ingredient>['columns'] = [
    {
      title: 'Nguyên liệu',
      render: (_, i) => (
        <span>
          <span style={{ fontSize: 18, marginInlineEnd: 8 }} title={i.category?.name ?? 'Chưa phân loại'}>
            {i.category?.icon ?? DEFAULT_INGREDIENT_ICON}
          </span>
          <Typography.Link strong onClick={() => setViewing(i.id)}>
            {i.name}
          </Typography.Link>
          <span style={{ marginInlineStart: 8 }}>
            <StatusTags i={i} />
          </span>
        </span>
      ),
    },
    { title: 'Loại', width: 140, responsive: ['xl'], render: (_, i) => i.category?.name ?? '—' },
    { title: 'Tồn kho', width: 120, align: 'right', render: (_, i) => `${fmtNum(i.quantity)} ${i.unit}` },
    {
      title: 'Tồn dùng được',
      width: 150,
      align: 'right',
      render: (_, i) => {
        const packs = fmtPacks(i.usableQty, i.unit, i.purchaseUnits);
        return (
          <span>
            {fmtNum(i.usableQty)} {i.unit}
            {packs && <div style={{ fontSize: 12, color: colors.muted }}>≈ {packs}</div>}
          </span>
        );
      },
    },
    { title: 'Ngưỡng', width: 110, align: 'right', render: (_, i) => `${fmtNum(i.minStock)} ${i.unit}` },
    {
      title: 'Hạn gần nhất',
      width: 140,
      render: (_, i) =>
        !i.nextExpiresAt ? (
          '—'
        ) : i.type === 'PREPARED' ? (
          <span title={fmtDateTime(i.nextExpiresAt)}>{fmtRemaining(i.nextExpiresAt)}</span>
        ) : (
          <span title={fmtRemaining(i.nextExpiresAt)}>{fmtDateTime(i.nextExpiresAt).slice(0, 10)}</span>
        ),
    },
    {
      title: 'Giá vốn',
      dataIndex: 'avgCost',
      width: 120,
      align: 'right',
      responsive: ['xl'],
      render: (v: number, i) => `${fmtUnitPrice(v)}/${i.unit}`,
    },
    ...(isManager
      ? [
          {
            title: 'Thao tác',
            width: 170,
            fixed: 'right' as const,
            render: (_: unknown, i: Ingredient) => (
              <Flex gap={8}>
                <Button size="small" onClick={() => openEditor(i)}>
                  Sửa
                </Button>
                {i.isActive ? (
                  <Popconfirm
                    title="Xóa nguyên liệu này?"
                    description="Nếu đã có phiếu, nguyên liệu chỉ bị ẩn đi."
                    okText="Xóa"
                    okButtonProps={{ danger: true }}
                    cancelText="Hủy"
                    onConfirm={() => deleteMutation.mutate(i.id)}
                  >
                    <Button size="small" danger>
                      Xóa
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" onClick={() => restoreMutation.mutate(i.id)}>
                    Kích hoạt
                  </Button>
                )}
              </Flex>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="Nguyên liệu"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
            Thêm nguyên liệu
          </Button>
        )
      }
    >
      <Flex gap={12} wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="Tìm theo tên nguyên liệu"
          style={{ width: 320 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select<number | 'none'>
          allowClear
          placeholder="Tất cả loại"
          style={{ width: 200 }}
          value={categoryId}
          options={[...(categoryOptions ?? []), { value: 'none', label: `${DEFAULT_INGREDIENT_ICON} Chưa phân loại` }]}
          onChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
        />
        <Select<IngredientType>
          allowClear
          placeholder="Tất cả kiểu"
          style={{ width: 180 }}
          value={type}
          options={(['RAW', 'PREPARED'] as const).map((t) => ({ value: t, label: ingredientTypeLabel[t] }))}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
        />
        <Select<StatusFilter>
          style={{ width: 160 }}
          value={status}
          options={[
            { value: 'active', label: 'Đang sử dụng' },
            { value: 'inactive', label: 'Đã ẩn' },
            { value: 'all', label: 'Tất cả' },
          ]}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </Flex>

      <Table<Ingredient>
        rowKey="id"
        columns={columns}
        dataSource={data?.items}
        loading={isLoading}
        locale={{ emptyText: <EmptyHint filtered={!!(q || categoryId || type || status !== 'active')} noun="nguyên liệu" actionLabel="Thêm nguyên liệu" onAction={isManager ? () => openEditor('new') : undefined} /> }}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: setPage,
        }}
      />

      <IngredientDrawer ingredientId={viewing} isManager={isManager} onClose={() => setViewing(null)} />

      <Modal
        title={editing === 'new' ? 'Thêm nguyên liệu' : 'Sửa nguyên liệu'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ minStock: 0, categoryId: null, type: 'RAW' }}
          onFinish={(v) =>
            saveMutation.mutate({ ...v, categoryId: v.categoryId ?? null, shelfLifeHours: v.shelfLifeHours ?? null })
          }
        >
          <Form.Item label="Kiểu" name="type">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={(['RAW', 'PREPARED'] as const).map((t) => ({ value: t, label: ingredientTypeLabel[t] }))}
            />
          </Form.Item>
          <Form.Item
            label="Tên nguyên liệu"
            name="name"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên nguyên liệu' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="Loại nguyên liệu" name="categoryId">
            <Select allowClear placeholder="Chưa phân loại" options={categoryOptions} />
          </Form.Item>
          <Form.Item
            label="Đơn vị tính"
            name="unit"
            rules={[{ required: true, message: 'Vui lòng chọn đơn vị tính' }]}
          >
            <Select showSearch placeholder="Chọn đơn vị tính" options={UNIT_OPTIONS} />
          </Form.Item>
          <Form.Item label="Ngưỡng cảnh báo sắp hết" name="minStock" rules={[{ required: true, message: 'Vui lòng nhập ngưỡng' }]}>
            <InputNumber min={0} precision={3} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={formType === 'PREPARED' ? 'Thời hạn sử dụng sau khi làm' : 'Thời hạn mặc định khi nhập (không bắt buộc)'}
            name="shelfLifeHours"
            extra={
              formType === 'PREPARED'
                ? 'Ví dụ cốt cà phê 24 giờ, trân châu 4 giờ. Sản lượng và định mức mẻ khai báo trong phần chi tiết.'
                : 'Dùng khi phiếu nhập không ghi hạn. Ví dụ sữa tươi 168 giờ (7 ngày).'
            }
            rules={[{ required: formType === 'PREPARED', message: 'Bán thành phẩm bắt buộc có thời hạn' }]}
          >
            <InputNumber min={1} max={8760} precision={0} suffix="giờ" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
