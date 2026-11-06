import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createPurchaseUnit,
  deletePurchaseUnit,
  DEFAULT_INGREDIENT_ICON,
  getIngredient,
  getPrepRecipe,
  ingredientTypeLabel,
  listIngredients,
  listLots,
  listMovements,
  listPurchaseUnits,
  lotSourceLabel,
  movementKindLabel,
  setPrepRecipe,
  updatePurchaseUnit,
  type Ingredient,
  type LotStatus,
  type Movement,
  type PurchaseUnit,
  type StockLot,
} from '../api/inventory';
import { fmtDateTime, fmtMoney, fmtNum, fmtPacks, fmtRemaining, fmtUnitPrice } from '../utils/format';
import { colors } from '../theme';
import DateField from './DateField';

const lotStatusTag: Record<LotStatus, { color: string; label: string }> = {
  OK: { color: 'green', label: 'Còn hạn' },
  EXPIRING: { color: 'orange', label: 'Sắp hết hạn' },
  EXPIRED: { color: 'volcano', label: 'Hết hạn' },
};

interface Props {
  ingredientId: number | null;
  isManager: boolean;
  onClose: () => void;
}

export default function IngredientDrawer({ ingredientId, isManager, onClose }: Props) {
  const { data: ing } = useQuery({
    queryKey: ['ingredients', 'detail', ingredientId],
    queryFn: () => getIngredient(ingredientId!),
    enabled: ingredientId !== null,
  });

  const items = ing
    ? [
        { key: 'info', label: 'Thông tin', children: <InfoTab ing={ing} /> },
        ...(ing.type === 'RAW'
          ? [{ key: 'units', label: 'Quy cách mua', children: <UnitsTab ing={ing} isManager={isManager} /> }]
          : [{ key: 'recipe', label: 'Định mức mẻ', children: <RecipeTab ing={ing} isManager={isManager} /> }]),
        { key: 'lots', label: 'Lô hàng', children: <LotsTab ing={ing} /> },
        { key: 'movements', label: 'Thẻ kho', children: <MovementsTab ing={ing} /> },
      ]
    : [];

  return (
    <Drawer
      open={ingredientId !== null}
      onClose={onClose}
      size={860}
      destroyOnHidden
      title={
        ing && (
          <span>
            <span style={{ marginInlineEnd: 8 }}>{ing.category?.icon ?? DEFAULT_INGREDIENT_ICON}</span>
            {ing.name}
            {ing.type === 'PREPARED' && (
              <Tag color="purple" style={{ marginInlineStart: 8 }}>
                Bán thành phẩm
              </Tag>
            )}
          </span>
        )
      }
    >
      {ing && <Tabs items={items} />}
    </Drawer>
  );
}

function withPacks(qty: number, ing: Ingredient) {
  const packs = fmtPacks(qty, ing.unit, ing.purchaseUnits);
  return (
    <span>
      {fmtNum(qty)} {ing.unit}
      {packs && <div style={{ fontSize: 12, color: colors.muted }}>≈ {packs}</div>}
    </span>
  );
}

function InfoTab({ ing }: { ing: Ingredient }) {
  return (
    <Descriptions column={2} bordered size="small">
      <Descriptions.Item label="Kiểu">{ingredientTypeLabel[ing.type]}</Descriptions.Item>
      <Descriptions.Item label="Loại">{ing.category ? `${ing.category.icon} ${ing.category.name}` : '—'}</Descriptions.Item>
      <Descriptions.Item label="Đơn vị gốc">{ing.unit}</Descriptions.Item>
      <Descriptions.Item label="Trạng thái">{ing.isActive ? 'Đang sử dụng' : 'Đã ẩn'}</Descriptions.Item>
      <Descriptions.Item label="Tồn sổ sách">{withPacks(ing.quantity, ing)}</Descriptions.Item>
      <Descriptions.Item label="Tồn dùng được">{withPacks(ing.usableQty, ing)}</Descriptions.Item>
      <Descriptions.Item label="Ngưỡng cảnh báo">{`${fmtNum(ing.minStock)} ${ing.unit}`}</Descriptions.Item>
      <Descriptions.Item label="Giá vốn bình quân">{`${fmtUnitPrice(ing.avgCost)}/${ing.unit}`}</Descriptions.Item>
      <Descriptions.Item label="Thời hạn sử dụng">
        {ing.shelfLifeHours ? `${ing.shelfLifeHours} giờ` : 'Không đặt'}
      </Descriptions.Item>
      <Descriptions.Item label="Hạn gần nhất">
        {ing.nextExpiresAt ? `${fmtDateTime(ing.nextExpiresAt)} (${fmtRemaining(ing.nextExpiresAt)})` : '—'}
      </Descriptions.Item>
      {ing.type === 'PREPARED' && (
        <Descriptions.Item label="Sản lượng một mẻ" span={2}>
          {ing.batchYield ? `${fmtNum(ing.batchYield)} ${ing.unit}` : 'Chưa khai báo'}
        </Descriptions.Item>
      )}
    </Descriptions>
  );
}

function UnitsTab({ ing, isManager }: { ing: Ingredient; isManager: boolean }) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name: string; factor: number }>();
  const key = ['ingredients', 'units', ing.id];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listPurchaseUnits(ing.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const create = useMutation({
    mutationFn: (v: { name: string; factor: number }) => createPurchaseUnit(ing.id, v),
    onSuccess: () => {
      form.resetFields();
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (u: PurchaseUnit) => updatePurchaseUnit(ing.id, u.id, { isActive: !u.isActive }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (u: PurchaseUnit) => deletePurchaseUnit(ing.id, u.id),
    onSuccess: () => {
      message.success('Đã xóa quy cách (nếu đã dùng trong phiếu thì chỉ ẩn)');
      refresh();
    },
    onError,
  });

  return (
    <>
      {isManager && (
        <Form form={form} layout="inline" style={{ marginBottom: 16 }} onFinish={(v) => create.mutate(v)}>
          <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên quy cách' }]}>
            <Input placeholder="Bao 1 kg, Thùng 12 hộp..." maxLength={50} style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="factor" rules={[{ required: true, message: 'Nhập hệ số' }]}>
            <InputNumber min={0.001} precision={3} placeholder="Hệ số" suffix={ing.unit} style={{ width: 180 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={create.isPending}>
            Thêm
          </Button>
        </Form>
      )}
      <Table<PurchaseUnit>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Quy cách', dataIndex: 'name' },
          { title: 'Quy đổi', render: (_, u) => `1 = ${fmtNum(u.factor)} ${ing.unit}` },
          { title: 'Trạng thái', render: (_, u) => (u.isActive ? <Tag color="green">Đang dùng</Tag> : <Tag>Đã ẩn</Tag>) },
          ...(isManager
            ? [
                {
                  title: 'Thao tác',
                  render: (_: unknown, u: PurchaseUnit) => (
                    <Space>
                      <Button size="small" onClick={() => toggle.mutate(u)}>
                        {u.isActive ? 'Ẩn' : 'Hiện'}
                      </Button>
                      <Popconfirm title="Xóa quy cách này?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(u)}>
                        <Button size="small" danger>
                          Xóa
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

type RecipeForm = { batchYield: number; items: { ingredientId: number; quantity: number }[] };

function RecipeTab({ ing, isManager }: { ing: Ingredient; isManager: boolean }) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<RecipeForm>();
  const key = ['ingredients', 'prep-recipe', ing.id];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => getPrepRecipe(ing.id) });
  const { data: raws } = useQuery({
    queryKey: ['ingredients', 'list', { type: 'RAW', isActive: true, all: true }],
    queryFn: () => listIngredients({ type: 'RAW', isActive: true, page: 1, pageSize: 100 }),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: (v: RecipeForm) => setPrepRecipe(ing.id, v),
    onSuccess: () => {
      message.success('Đã lưu định mức mẻ');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  if (editing) {
    return (
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          batchYield: data?.batchYield ?? undefined,
          items: data?.items.length ? data.items.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity })) : [{}],
        }}
        onFinish={(v) => save.mutate(v)}
      >
        <Form.Item label="Sản lượng một mẻ" name="batchYield" rules={[{ required: true, message: 'Nhập sản lượng một mẻ' }]}>
          <InputNumber min={0.001} precision={3} suffix={ing.unit} style={{ width: 240 }} />
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
                    <InputNumber min={0.001} precision={3} placeholder="Lượng" style={{ width: 160 }} />
                  </Form.Item>
                  {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(f.name)} />}
                </Flex>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} style={{ marginTop: 12 }}>
                Thêm dòng
              </Button>
            </>
          )}
        </Form.List>
        <Flex gap={8} style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            Lưu định mức
          </Button>
          <Button onClick={() => setEditing(false)}>Hủy</Button>
        </Flex>
      </Form>
    );
  }

  const unitCost = data?.batchYield ? data.batchCost / data.batchYield : null;
  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Typography.Text>
          Một mẻ thu <b>{data?.batchYield ? `${fmtNum(data.batchYield)} ${ing.unit}` : 'chưa khai báo'}</b>
          {data && data.items.length > 0 && (
            <>
              {' '}
              · Chi phí ước tính {fmtMoney(data.batchCost)}
              {unitCost !== null && ` (${fmtUnitPrice(unitCost)}/${ing.unit})`}
            </>
          )}
        </Typography.Text>
        {isManager && <Button onClick={() => setEditing(true)}>Sửa định mức</Button>}
      </Flex>
      <Table
        rowKey="ingredientId"
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={false}
        locale={{ emptyText: <Empty description="Chưa có định mức" /> }}
        columns={[
          { title: 'Nguyên liệu thô', render: (_, i) => i.ingredient.name },
          { title: 'Lượng / mẻ', align: 'right', render: (_, i) => `${fmtNum(i.quantity)} ${i.ingredient.unit}` },
          { title: 'Giá vốn', align: 'right', render: (_, i) => `${fmtUnitPrice(i.ingredient.avgCost)}/${i.ingredient.unit}` },
          { title: 'Thành tiền', align: 'right', render: (_, i) => fmtMoney(i.quantity * i.ingredient.avgCost) },
        ]}
      />
    </>
  );
}

function LotsTab({ ing }: { ing: Ingredient }) {
  const { data, isLoading } = useQuery({ queryKey: ['ingredients', 'lots', ing.id], queryFn: () => listLots(ing.id) });
  return (
    <Table<StockLot>
      rowKey="id"
      size="small"
      loading={isLoading}
      dataSource={data}
      pagination={false}
      locale={{ emptyText: <Empty description="Không còn lô nào tồn" /> }}
      columns={[
        { title: 'Lô', render: (_, l) => `#${l.id}` },
        {
          title: 'Nguồn',
          render: (_, l) => (
            <span>
              {lotSourceLabel[l.source]}
              {l.refCode && <Typography.Text type="secondary"> · {l.refCode}</Typography.Text>}
              {l.supplierName && <div style={{ fontSize: 12, color: colors.muted }}>{l.supplierName}</div>}
            </span>
          ),
        },
        { title: 'Ngày tạo', render: (_, l) => fmtDateTime(l.createdAt) },
        { title: 'Ban đầu', align: 'right', render: (_, l) => fmtNum(l.initialQty) },
        {
          title: 'Còn lại',
          align: 'right',
          render: (_, l) => {
            const packs = fmtPacks(l.remainingQty, ing.unit, ing.purchaseUnits);
            return (
              <span>
                <b>{fmtNum(l.remainingQty)}</b>
                {packs && <div style={{ fontSize: 12, color: colors.muted }}>≈ {packs}</div>}
              </span>
            );
          },
        },
        { title: 'Giá lô', align: 'right', render: (_, l) => fmtUnitPrice(l.unitCost) },
        {
          title: 'Hạn',
          render: (_, l) => (
            <span>
              {fmtDateTime(l.expiresAt)}
              {l.expiresAt && <div style={{ fontSize: 12, color: colors.muted }}>{fmtRemaining(l.expiresAt)}</div>}
            </span>
          ),
        },
        { title: 'Trạng thái', render: (_, l) => <Tag color={lotStatusTag[l.status].color}>{lotStatusTag[l.status].label}</Tag> },
      ]}
    />
  );
}

const PAGE_SIZE = 15;

function MovementsTab({ ing }: { ing: Ingredient }) {
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['ingredients', 'movements', ing.id, { from, to, page }],
    queryFn: () => listMovements(ing.id, { from, to, page, pageSize: PAGE_SIZE }),
  });

  return (
    <>
      <Flex gap={8} align="center" style={{ marginBottom: 12 }}>
        <DateField
          style={{ width: 170 }}
          placeholder="Từ ngày"
          value={from}
          max={to}
          onChange={(v) => {
            setFrom(v || undefined);
            setPage(1);
          }}
        />
        <span>→</span>
        <DateField
          style={{ width: 170 }}
          placeholder="Đến ngày"
          value={to}
          min={from}
          onChange={(v) => {
            setTo(v || undefined);
            setPage(1);
          }}
        />
      </Flex>
      <Table<Movement>
        rowKey={(m) => `${m.kind}-${m.code}-${m.at}`}
        size="small"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, hideOnSinglePage: true }}
        columns={[
          { title: 'Thời gian', render: (_, m) => fmtDateTime(m.at) },
          { title: 'Nghiệp vụ', render: (_, m) => movementKindLabel[m.kind] },
          { title: 'Mã phiếu', render: (_, m) => m.code ?? '—' },
          {
            title: 'Số lượng',
            align: 'right',
            render: (_, m) => (
              <Typography.Text type={m.quantity < 0 ? 'danger' : 'success'}>
                {m.quantity > 0 ? '+' : ''}
                {fmtNum(m.quantity)}
              </Typography.Text>
            ),
          },
          { title: 'Giá', align: 'right', render: (_, m) => fmtUnitPrice(m.unitCost) },
          { title: `Tồn sau (${ing.unit})`, align: 'right', render: (_, m) => fmtNum(m.balanceAfter) },
          { title: 'Ghi chú', render: (_, m) => m.note ?? '' },
        ]}
      />
    </>
  );
}
