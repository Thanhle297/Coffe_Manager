import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Descriptions, Drawer, Flex, Form, Input, InputNumber, Modal, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  DEFAULT_INGREDIENT_ICON,
  createStockIn,
  getStockIn,
  listIngredients,
  listPurchaseUnits,
  listStockIns,
  listSuppliers,
  type Ingredient,
  type StockIn,
  type StockInInput,
  type StockInItem,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import { fmtDateTime, fmtMoney, fmtNum, fmtUnitPrice } from '../utils/format';
import { colors } from '../theme';
import DateField from '../components/DateField';
import EmptyHint from '../components/EmptyHint';

const PAGE_SIZE = 10;
const today = () => new Date().toLocaleDateString('en-CA');
const fmtDate = (v: string) => v.split('-').reverse().join('/');
/** Giá trị "đơn vị gốc" trong ô chọn quy cách. */
const BASE_UNIT = 0;

interface FormLine {
  ingredientId?: number;
  purchaseUnitId?: number;
  packQty?: number;
  packPrice?: number;
  quantity?: number;
  unitPrice?: number;
  expiryDate?: string;
}

const lineTotal = (l?: FormLine) =>
  !l
    ? 0
    : l.purchaseUnitId
      ? Math.round((l.packQty ?? 0) * (l.packPrice ?? 0))
      : Math.round((l.quantity ?? 0) * (l.unitPrice ?? 0));

/** Một dòng phiếu nhập: chọn nguyên liệu, quy cách hoặc đơn vị gốc, hiện phần quy đổi. */
function StockInLineFields({
  name,
  ingredients,
  line,
  onPick,
}: {
  name: number;
  ingredients: Ingredient[] | undefined;
  line: FormLine | undefined;
  onPick: () => void;
}) {
  const ing = ingredients?.find((i) => i.id === line?.ingredientId);
  const { data: units } = useQuery({
    queryKey: ['ingredients', 'units', line?.ingredientId],
    queryFn: () => listPurchaseUnits(line!.ingredientId!),
    enabled: !!line?.ingredientId,
  });
  const activeUnits = units?.filter((u) => u.isActive) ?? [];
  const unit = activeUnits.find((u) => u.id === line?.purchaseUnitId);
  const byPack = !!line?.purchaseUnitId;

  let conversion = '';
  if (ing && unit && line?.packQty) {
    const qty = line.packQty * unit.factor;
    conversion = `= ${fmtNum(qty)} ${ing.unit}`;
    if (line.packPrice != null) conversion += ` · ${fmtUnitPrice(line.packPrice / unit.factor)}/${ing.unit}`;
  }

  return (
    <>
      <Form.Item name={[name, 'ingredientId']} rules={[{ required: true, message: 'Chọn nguyên liệu' }]} style={{ flex: 2, minWidth: 200 }}>
        <Select
          placeholder="Nguyên liệu"
          showSearch={{ optionFilterProp: 'label' }}
          onChange={onPick}
          options={ingredients?.map((i) => ({ value: i.id, label: `${i.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.name} (${i.unit})` }))}
        />
      </Form.Item>
      <Form.Item name={[name, 'purchaseUnitId']} style={{ width: 170 }}>
        <Select
          disabled={!ing}
          options={[
            { value: BASE_UNIT, label: ing ? `Đơn vị gốc (${ing.unit})` : 'Đơn vị gốc' },
            ...activeUnits.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
      </Form.Item>
      {byPack ? (
        <>
          <Form.Item name={[name, 'packQty']} rules={[{ required: true, message: 'Nhập số lượng' }]} style={{ width: 110 }} extra={conversion}>
            <InputNumber min={0.001} precision={3} placeholder="Số lượng" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name={[name, 'packPrice']} rules={[{ required: true, message: 'Nhập giá' }]} style={{ width: 150 }}>
            <InputNumber min={0} precision={2} placeholder="Giá 1 quy cách (₫)" style={{ width: '100%' }} />
          </Form.Item>
        </>
      ) : (
        <>
          <Form.Item name={[name, 'quantity']} rules={[{ required: true, message: 'Nhập số lượng' }]} style={{ width: 110 }}>
            <InputNumber min={0.001} precision={3} placeholder={ing ? `Số ${ing.unit}` : 'Số lượng'} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name={[name, 'unitPrice']} rules={[{ required: true, message: 'Nhập đơn giá' }]} style={{ width: 150 }}>
            <InputNumber min={0} precision={4} placeholder={ing ? `Đơn giá (₫/${ing.unit})` : 'Đơn giá (₫)'} style={{ width: '100%' }} />
          </Form.Item>
        </>
      )}
      <Form.Item
        name={[name, 'expiryDate']}
        style={{ width: 150 }}
        extra={!line?.expiryDate && ing?.shelfLifeHours ? `Mặc định ${ing.shelfLifeHours} giờ` : undefined}
      >
        <DateField title="Hạn sử dụng" placeholder="Hạn sử dụng" min={today()} />
      </Form.Item>
    </>
  );
}
interface FormValues {
  supplierId: number;
  importDate: string;
  note?: string;
  items: FormLine[];
}

export default function StockInPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState<number>();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form] = Form.useForm<FormValues>();
  const lines = Form.useWatch('items', form);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-in', { from, to, supplierId, page }],
    queryFn: () =>
      listStockIns({ from: from || undefined, to: to || undefined, supplierId, page, pageSize: PAGE_SIZE }),
  });
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: () => listSuppliers({ isActive: true, page: 1, pageSize: 100 }),
  });
  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', 'options', 'RAW'],
    queryFn: () => listIngredients({ isActive: true, type: 'RAW', page: 1, pageSize: 100 }),
    enabled: creating,
  });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-in', 'detail', detailId],
    queryFn: () => getStockIn(detailId!),
    enabled: detailId !== null,
  });

  const createMutation = useMutation({
    mutationFn: createStockIn,
    onSuccess: (s) => {
      message.success(`Đã lập phiếu nhập ${s.code}`);
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ['stock-in'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const total = (lines ?? []).reduce((sum, l) => sum + lineTotal(l), 0);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ importDate: today(), items: [{ purchaseUnitId: BASE_UNIT }] });
    setCreating(true);
  };

  const submit = (v: FormValues) => {
    const input: StockInInput = {
      supplierId: v.supplierId,
      importDate: v.importDate,
      note: v.note?.trim() || undefined,
      items: v.items.map((l) => {
        const expiryDate = l.expiryDate?.trim() ? l.expiryDate : null;
        return l.purchaseUnitId
          ? { ingredientId: l.ingredientId!, purchaseUnitId: l.purchaseUnitId, packQty: l.packQty!, packPrice: l.packPrice!, expiryDate }
          : { ingredientId: l.ingredientId!, quantity: l.quantity!, unitPrice: l.unitPrice!, expiryDate };
      }),
    };
    createMutation.mutate(input);
  };

  const columns: TableProps<StockIn>['columns'] = [
    { title: 'Mã phiếu', dataIndex: 'code', width: 180, render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Ngày nhập', dataIndex: 'importDate', width: 120, render: fmtDate },
    { title: 'Nhà cung cấp', render: (_, s) => s.supplier.name },
    { title: 'Tổng tiền', dataIndex: 'total', width: 150, align: 'right', render: fmtMoney },
    { title: 'Người lập', responsive: ['lg'], render: (_, s) => s.createdBy.fullName },
    {
      title: 'Thao tác',
      width: 100,
      render: (_, s) => (
        <Button size="small" onClick={() => setDetailId(s.id)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const itemColumns: TableProps<StockInItem>['columns'] = [
    { title: 'Nguyên liệu', render: (_, i) => `${i.ingredient.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.ingredient.name}` },
    {
      title: 'Số lượng',
      align: 'right',
      render: (_, i) => (
        <span>
          {fmtNum(i.quantity)} {i.ingredient.unit}
          {i.purchaseUnitName && (
            <div style={{ fontSize: 12, color: colors.muted }}>
              {fmtNum(i.packQty)} × {i.purchaseUnitName}
            </div>
          )}
        </span>
      ),
    },
    {
      title: 'Đơn giá',
      align: 'right',
      render: (_, i) => (
        <span>
          {fmtUnitPrice(i.unitPrice)}/{i.ingredient.unit}
          {i.packPrice != null && <div style={{ fontSize: 12, color: colors.muted }}>{fmtMoney(i.packPrice)}/quy cách</div>}
        </span>
      ),
    },
    { title: 'Hạn', dataIndex: 'expiresAt', render: (v: string | null) => fmtDateTime(v) },
  ];

  return (
    <Card
      title="Phiếu nhập kho"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Lập phiếu nhập
          </Button>
        )
      }
    >
      <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
        <DateField style={{ width: 160 }} placeholder="Từ ngày" value={from} max={to || undefined} onChange={(v) => { setFrom(v); setPage(1); }} />
        <span>→</span>
        <DateField style={{ width: 160 }} placeholder="Đến ngày" value={to} min={from || undefined} onChange={(v) => { setTo(v); setPage(1); }} />
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Tất cả nhà cung cấp"
          style={{ width: 240 }}
          value={supplierId}
          options={suppliers?.items.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => { setSupplierId(v); setPage(1); }}
        />
      </Flex>

      <Table<StockIn>
        rowKey="id"
        columns={columns}
        dataSource={data?.items}
        loading={isLoading}
        locale={{ emptyText: <EmptyHint filtered={!!(from || to || supplierId)} noun="phiếu nhập" actionLabel="Lập phiếu nhập" onAction={isManager ? openCreate : undefined} /> }}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, showSizeChanger: false, hideOnSinglePage: true, onChange: setPage }}
      />

      <Modal
        title="Lập phiếu nhập kho"
        open={creating}
        width="min(1100px, 95vw)"
        okText="Lập phiếu"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
        forceRender
      >
        <Form<FormValues> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          <Flex gap={16} wrap>
            <Form.Item label="Nhà cung cấp" name="supplierId" rules={[{ required: true, message: 'Vui lòng chọn nhà cung cấp' }]} style={{ flex: 1, minWidth: 220 }}>
              <Select showSearch={{ optionFilterProp: 'label' }} options={suppliers?.items.map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
            <Form.Item label="Ngày nhập" name="importDate" rules={[{ required: true, message: 'Vui lòng chọn ngày nhập' }]}>
              <DateField />
            </Form.Item>
          </Flex>
          <Form.Item label="Ghi chú" name="note">
            <Input maxLength={255} />
          </Form.Item>

          <Form.List
            name="items"
            rules={[
              {
                validator: async (_, items: FormLine[] | undefined) => {
                  const ids = (items ?? []).map((l) => l?.ingredientId).filter(Boolean);
                  if (ids.length === 0) throw new Error('Phiếu phải có ít nhất một nguyên liệu');
                  if (new Set(ids).size !== ids.length) throw new Error('Một nguyên liệu chỉ được xuất hiện một lần');
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <Flex gap={8} wrap aria-hidden="true" style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
                  <span style={{ flex: 2, minWidth: 200 }}>Nguyên liệu</span>
                  <span style={{ width: 170 }}>Quy cách</span>
                  <span style={{ width: 110 }}>Số lượng</span>
                  <span style={{ width: 150 }}>Giá nhập (₫)</span>
                  <span style={{ width: 150 }}>Hạn sử dụng</span>
                </Flex>
                {fields.map((field) => (
                  <Flex key={field.key} gap={8} align="start" wrap>
                    <StockInLineFields
                      name={field.name}
                      ingredients={ingredients?.items}
                      line={lines?.[field.name]}
                      onPick={() => form.setFieldValue(['items', field.name, 'purchaseUnitId'], BASE_UNIT)}
                    />
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Xóa dòng" title={fields.length === 1 ? "Phiếu cần ít nhất một dòng" : "Xóa dòng"} disabled={fields.length === 1} onClick={() => remove(field.name)} />
                  </Flex>
                ))}
                <Form.ErrorList errors={errors} />
                <Flex justify="space-between" align="center">
                  <Button icon={<PlusOutlined />} onClick={() => add({ purchaseUnitId: BASE_UNIT })}>
                    Thêm dòng
                  </Button>
                  <Typography.Text strong style={{ fontSize: 16 }}>
                    Tổng tiền: {fmtMoney(total)}
                  </Typography.Text>
                </Flex>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Drawer
        title={detail ? `Phiếu nhập ${detail.code}` : 'Phiếu nhập'}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        size={640}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Nhà cung cấp">{detail.supplier.name}</Descriptions.Item>
              <Descriptions.Item label="Ngày nhập">{fmtDate(detail.importDate)}</Descriptions.Item>
              <Descriptions.Item label="Người lập">{detail.createdBy.fullName}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{detail.note ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Tổng tiền">{fmtMoney(detail.total)}</Descriptions.Item>
            </Descriptions>
            <Table<StockInItem> rowKey="id" size="small" pagination={false} columns={itemColumns} dataSource={detail.items} />
          </>
        )}
      </Drawer>
    </Card>
  );
}
