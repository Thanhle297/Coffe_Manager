import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Descriptions, Drawer, Flex, Input, InputNumber, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { AuditOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createStockCount,
  DEFAULT_INGREDIENT_ICON,
  getStockCount,
  listIngredients,
  listStockCounts,
  type Ingredient,
  type StockCount,
  type StockCountItem,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import { fmtDateTime, fmtMoney, fmtNum, fmtPacks, fmtUnitPrice } from '../utils/format';
import { colors } from '../theme';
import EmptyHint from '../components/EmptyHint';

const PAGE_SIZE = 10;
const diffColor = (d: number) => (d < 0 ? colors.down : d > 0 ? colors.up : undefined);
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmtNum(n)}`;
const signedMoney = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtMoney(Math.abs(n))}`;

/** Số đếm một dòng: `packs` quy cách `unitId` cộng `loose` đơn vị gốc (phần lẻ, hộp đã mở...). */
type CountEntry = { unitId?: number; packs: number | null; loose: number | null };

/** Quy cách mặc định khi đếm: quy cách nhỏ nhất (hộp, lon), vì hàng thường được đếm theo đơn vị lẻ. */
const defaultUnit = (i: Ingredient) => i.purchaseUnits[i.purchaseUnits.length - 1];

/** Bảng nhập số đếm thực tế cho mọi nguyên liệu đang dùng. Chỉ dòng đã nhập mới được gửi. */
function CountSheet({ onDone }: { onDone: () => void }) {
  const { message, modal } = AntdApp.useApp();
  const [counts, setCounts] = useState<Record<number, CountEntry>>({});
  const setEntry = (id: number, patch: Partial<CountEntry>) =>
    setCounts((c) => ({ ...c, [id]: { ...(c[id] ?? { packs: null, loose: null }), ...patch } }));
  const actualOf = (i: Ingredient): number | null => {
    const c = counts[i.id];
    if (!c || (c.packs == null && c.loose == null)) return null;
    const unit = i.purchaseUnits.find((u) => u.id === c.unitId) ?? defaultUnit(i);
    return Math.round(((c.packs ?? 0) * (unit?.factor ?? 0) + (c.loose ?? 0)) * 1000) / 1000;
  };
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['ingredients', 'list', { isActive: true, all: true }],
    queryFn: () => listIngredients({ isActive: true, page: 1, pageSize: 100 }),
  });

  const actual: Record<number, number | null> = Object.fromEntries(
    (data?.items ?? []).map((i) => [i.id, actualOf(i)] as const),
  );

  const rows = useMemo(
    () => (data?.items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  const entered = (data?.items ?? []).filter((i) => actual[i.id] != null);
  const diffOf = (i: Ingredient) => (actual[i.id] != null ? actual[i.id]! - i.quantity : null);
  const totalValue = entered.reduce((s, i) => s + diffOf(i)! * i.avgCost, 0);

  const mutation = useMutation({
    mutationFn: () =>
      createStockCount({
        note: note.trim() || undefined,
        items: entered.map((i) => ({ ingredientId: i.id, actualQty: actual[i.id]! })),
      }),
    onSuccess: (c) => {
      message.success(`Đã lưu phiếu kiểm kê ${c.code}`);
      setCounts({});
      setNote('');
      onDone();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const confirm = () => {
    const changed = entered.filter((i) => diffOf(i) !== 0).length;
    modal.confirm({
      title: 'Lưu phiếu kiểm kê?',
      content: (
        <>
          <p>
            {entered.length} nguyên liệu đã đếm, {changed} nguyên liệu có chênh lệch.
          </p>
          <p>
            Tổng giá trị chênh lệch: <b style={{ color: diffColor(totalValue) }}>{signedMoney(totalValue)}</b>
          </p>
          <p>Phiếu được áp dụng ngay và không sửa được.</p>
        </>
      ),
      okText: 'Lưu và áp dụng',
      cancelText: 'Hủy',
      onOk: () => mutation.mutateAsync(),
    });
  };

  const columns: TableProps<Ingredient>['columns'] = [
    { title: 'Nguyên liệu', render: (_, i) => `${i.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.name}` },
    { title: 'Đơn vị', dataIndex: 'unit', width: 80 },
    {
      title: 'Tồn sổ sách',
      align: 'right',
      render: (_, i) => (
        <span>
          {fmtNum(i.quantity)}
          {fmtPacks(i.quantity, i.unit, i.purchaseUnits) && (
            <div style={{ fontSize: 12, color: colors.muted }}>≈ {fmtPacks(i.quantity, i.unit, i.purchaseUnits)}</div>
          )}
          {i.quantity > i.usableQty && (
            <div style={{ fontSize: 12, color: colors.warn }}>gồm {fmtNum(i.quantity - i.usableQty)} hết hạn</div>
          )}
        </span>
      ),
    },
    {
      title: 'Số đếm thực tế',
      width: 400,
      render: (_, i) => {
        const c = counts[i.id];
        const unit = i.purchaseUnits.find((u) => u.id === c?.unitId) ?? defaultUnit(i);
        return (
          <div>
            <Flex gap={4} align="center">
              {unit && (
                <>
                  <InputNumber
                    min={0}
                    precision={0}
                    placeholder="SL"
                    value={c?.packs ?? null}
                    onChange={(v) => setEntry(i.id, { packs: v })}
                    style={{ width: 70 }}
                  />
                  <Select
                    value={unit.id}
                    popupMatchSelectWidth={false}
                    options={i.purchaseUnits.map((u) => ({ value: u.id, label: u.name }))}
                    onChange={(v) => setEntry(i.id, { unitId: v })}
                    style={{ width: 140 }}
                  />
                  <span>+</span>
                </>
              )}
              <InputNumber
                min={0}
                precision={3}
                placeholder={unit ? 'Lẻ' : 'Số đếm'}
                value={c?.loose ?? null}
                onChange={(v) => setEntry(i.id, { loose: v })}
                suffix={i.unit}
                style={{ width: unit ? 120 : 200 }}
              />
            </Flex>
            {unit && actual[i.id] != null && (
              <div style={{ fontSize: 12, color: colors.muted }}>
                = {fmtNum(actual[i.id])} {i.unit}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Chênh lệch',
      align: 'right',
      render: (_, i) => {
        const d = diffOf(i);
        return d == null ? '' : <b style={{ color: diffColor(d) }}>{signed(d)}</b>;
      },
    },
    {
      title: 'Giá trị',
      align: 'right',
      render: (_, i) => {
        const d = diffOf(i);
        return d == null ? '' : <span style={{ color: diffColor(d) }}>{signedMoney(d * i.avgCost)}</span>;
      },
    },
    { title: 'Giá vốn', align: 'right', responsive: ['lg'], render: (_, i) => fmtUnitPrice(i.avgCost) },
  ];

  return (
    <>
      <Flex gap={12} wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="Lọc theo tên" style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} />
        <Input placeholder="Ghi chú phiếu" maxLength={255} style={{ flex: 1, minWidth: 200 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </Flex>
      <Table<Ingredient>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ y: 480, x: 'max-content' }}
      />
      <Flex justify="space-between" align="center" style={{ marginTop: 16 }}>
        <Typography.Text>
          Đã đếm {entered.length} nguyên liệu · Tổng chênh lệch:{' '}
          <b style={{ color: diffColor(totalValue) }}>{signedMoney(totalValue)}</b>
        </Typography.Text>
        <Button type="primary" disabled={entered.length === 0} loading={mutation.isPending} onClick={confirm}>
          Lưu phiếu kiểm kê
        </Button>
      </Flex>
    </>
  );
}

export default function StockCountPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const queryClient = useQueryClient();
  const [counting, setCounting] = useState(false);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-counts', { page }],
    queryFn: () => listStockCounts({ page, pageSize: PAGE_SIZE }),
  });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-counts', 'detail', detailId],
    queryFn: () => getStockCount(detailId!),
    enabled: detailId !== null,
  });

  const columns: TableProps<StockCount>['columns'] = [
    { title: 'Mã phiếu', dataIndex: 'code', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Thời gian', dataIndex: 'createdAt', render: fmtDateTime },
    { title: 'Số nguyên liệu', align: 'right', render: (_, c) => `${c.diffCount ?? 0} lệch / ${c.itemCount ?? 0}` },
    { title: 'Tăng', align: 'right', render: (_, c) => <span style={{ color: diffColor(c.increaseValue) }}>{signedMoney(c.increaseValue)}</span> },
    { title: 'Giảm', align: 'right', render: (_, c) => <span style={{ color: diffColor(c.decreaseValue) }}>{signedMoney(c.decreaseValue)}</span> },
    { title: 'Người lập', responsive: ['lg'], render: (_, c) => c.createdBy.fullName },
    { title: 'Ghi chú', dataIndex: 'note', responsive: ['lg'], render: (v: string | null) => v ?? '—' },
    {
      title: '',
      render: (_, c) => (
        <Button size="small" onClick={() => setDetailId(c.id)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const itemColumns: TableProps<StockCountItem>['columns'] = [
    { title: 'Nguyên liệu', render: (_, i) => `${i.ingredient.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.ingredient.name}` },
    { title: 'Sổ sách', align: 'right', render: (_, i) => fmtNum(i.systemQty) },
    { title: 'Thực tế', align: 'right', render: (_, i) => fmtNum(i.actualQty) },
    { title: 'Chênh lệch', align: 'right', render: (_, i) => <b style={{ color: diffColor(i.diff) }}>{`${signed(i.diff)} ${i.ingredient.unit}`}</b> },
    { title: 'Giá trị', align: 'right', render: (_, i) => <span style={{ color: diffColor(i.diff) }}>{signedMoney(i.diff * i.unitCost)}</span> },
  ];

  return (
    <Flex vertical gap={16}>
      {counting && (
        <Card title="Lập phiếu kiểm kê" extra={<Button onClick={() => setCounting(false)}>Đóng</Button>}>
          <CountSheet
            onDone={() => {
              setCounting(false);
              queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
              queryClient.invalidateQueries({ queryKey: ['ingredients'] });
              queryClient.invalidateQueries({ queryKey: ['stock-out'] });
            }}
          />
        </Card>
      )}

      <Card
        title="Phiếu kiểm kê"
        extra={
          isManager &&
          !counting && (
            <Button type="primary" icon={<AuditOutlined />} onClick={() => setCounting(true)}>
              Kiểm kê
            </Button>
          )
        }
      >
        <Table<StockCount>
          rowKey="id"
          columns={columns}
          dataSource={data?.items}
          loading={isLoading}
          locale={{ emptyText: <EmptyHint noun="phiếu kiểm kê" actionLabel="Lập phiếu kiểm kê" onAction={isManager ? () => setCounting(true) : undefined} /> }}
          scroll={{ x: 'max-content' }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, showSizeChanger: false, hideOnSinglePage: true, onChange: setPage }}
        />
      </Card>

      <Drawer
        title={detail ? `Phiếu kiểm kê ${detail.code}` : 'Phiếu kiểm kê'}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        size={760}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Thời gian">{fmtDateTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Người lập">{detail.createdBy.fullName}</Descriptions.Item>
              <Descriptions.Item label="Tăng">{signedMoney(detail.increaseValue)}</Descriptions.Item>
              <Descriptions.Item label="Giảm">{signedMoney(detail.decreaseValue)}</Descriptions.Item>
              <Descriptions.Item label="Phiếu điều chỉnh">{detail.stockOut?.code ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{detail.note ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Table<StockCountItem> rowKey="id" size="small" pagination={false} columns={itemColumns} dataSource={detail.items} />
          </>
        )}
      </Drawer>
    </Flex>
  );
}
