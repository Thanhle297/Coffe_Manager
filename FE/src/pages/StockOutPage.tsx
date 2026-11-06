import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Descriptions, Drawer, Flex, Form, Input, InputNumber, Modal, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DeleteOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  DEFAULT_INGREDIENT_ICON,
  createStockOut,
  discardExpired,
  getLowStock,
  getStockOut,
  listIngredients,
  listStockOuts,
  lotSourceLabel,
  stockOutReasonLabel,
  type ManualStockOutReason,
  type StockOut,
  type StockOutItem,
  type StockOutReason,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import { fmtDateTime, fmtMoney, fmtNum, fmtUnitPrice } from '../utils/format';
import DateField from '../components/DateField';
import EmptyHint from '../components/EmptyHint';

const PAGE_SIZE = 10;
const reasonColor: Record<StockOutReason, string> = {
  SALE: 'blue',
  USAGE: 'green',
  DISCARD: 'red',
  ADJUST: 'gold',
  PREP: 'purple',
};

interface FormLine {
  ingredientId?: number;
  quantity?: number;
}
interface FormValues {
  reason: ManualStockOutReason;
  note?: string;
  items: FormLine[];
}

export default function StockOutPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState<StockOutReason>();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form] = Form.useForm<FormValues>();
  const selectedReason = Form.useWatch('reason', form);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Q5: Nhân viên chỉ được lập phiếu Sử dụng hoặc Hủy.
  const manualReasons: ManualStockOutReason[] = isManager ? ['USAGE', 'DISCARD', 'ADJUST'] : ['USAGE', 'DISCARD'];

  const { data, isLoading } = useQuery({
    queryKey: ['stock-out', { from, to, reason, page }],
    queryFn: () => listStockOuts({ from: from || undefined, to: to || undefined, reason, page, pageSize: PAGE_SIZE }),
  });
  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', 'options'],
    queryFn: () => listIngredients({ isActive: true, page: 1, pageSize: 100 }),
    enabled: creating,
  });
  const { data: lowStock } = useQuery({ queryKey: ['ingredients', 'low-stock'], queryFn: getLowStock });
  const expired = (lowStock ?? []).filter((i) => i.reasons.includes('EXPIRED'));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-out'] });
    queryClient.invalidateQueries({ queryKey: ['ingredients'] });
  };

  const discardMutation = useMutation({
    mutationFn: () => discardExpired(),
    onSuccess: (out) => {
      message.success(out ? `Đã hủy lô hết hạn, phiếu ${out.code}` : 'Không có lô nào hết hạn');
      setDiscardOpen(false);
      invalidate();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-out', 'detail', detailId],
    queryFn: () => getStockOut(detailId!),
    enabled: detailId !== null,
  });

  const createMutation = useMutation({
    mutationFn: createStockOut,
    onSuccess: (s) => {
      message.success(`Đã lập phiếu xuất ${s.code}`);
      setCreating(false);
      invalidate();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ reason: 'USAGE', items: [{}] });
    setCreating(true);
  };

  const columns: TableProps<StockOut>['columns'] = [
    { title: 'Mã phiếu', dataIndex: 'code', width: 180, render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Thời gian', dataIndex: 'createdAt', width: 170, render: fmtDateTime },
    { title: 'Lý do', dataIndex: 'reason', width: 130, render: (r: StockOutReason) => <Tag color={reasonColor[r]}>{stockOutReasonLabel[r]}</Tag> },
    { title: 'Người lập', responsive: ['lg'], render: (_, s) => s.createdBy?.fullName ?? 'Hệ thống' },
    { title: 'Ghi chú', dataIndex: 'note', responsive: ['lg'], render: (v: string | null) => v ?? '—' },
    {
      title: 'Liên quan',
      responsive: ['lg'],
      render: (_, s) => s.prepBatch?.code ?? s.stockCount?.code ?? (s.orderId ? `Đơn #${s.orderId}` : '—'),
    },
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

  const itemColumns: TableProps<StockOutItem>['columns'] = [
    { title: 'Nguyên liệu', render: (_, i) => `${i.ingredient.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.ingredient.name}` },
    { title: 'Số lượng', align: 'right', render: (_, i) => `${fmtNum(i.quantity)} ${i.ingredient.unit}` },
    { title: 'Giá vốn', align: 'right', render: (_, i) => `${fmtUnitPrice(i.unitCost)}/${i.ingredient.unit}` },
    { title: 'Thành tiền', align: 'right', render: (_, i) => fmtMoney(i.quantity * i.unitCost) },
    {
      title: 'Trừ vào lô',
      render: (_, i) =>
        i.allocations.map((a) => (
          <div key={a.id} style={{ fontSize: 12 }}>
            Lô #{a.lotId} ({lotSourceLabel[a.lot.source]}
            {a.lot.expiresAt ? `, hạn ${fmtDateTime(a.lot.expiresAt)}` : ''}): <b>{fmtNum(a.quantity)}</b>
          </div>
        )),
    },
  ];

  return (
    <Card
      title="Phiếu xuất kho"
      extra={
        <Flex gap={8}>
          <Button danger icon={<StopOutlined />} onClick={() => setDiscardOpen(true)}>
            Hủy lô hết hạn{expired.length > 0 ? ` (${expired.length})` : ''}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Lập phiếu xuất
          </Button>
        </Flex>
      }
    >
      <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
        <DateField style={{ width: 160 }} placeholder="Từ ngày" value={from} max={to || undefined} onChange={(v) => { setFrom(v); setPage(1); }} />
        <span>→</span>
        <DateField style={{ width: 160 }} placeholder="Đến ngày" value={to} min={from || undefined} onChange={(v) => { setTo(v); setPage(1); }} />
        <Select
          allowClear
          placeholder="Tất cả lý do"
          style={{ width: 180 }}
          value={reason}
          options={(Object.keys(stockOutReasonLabel) as StockOutReason[]).map((r) => ({ value: r, label: stockOutReasonLabel[r] }))}
          onChange={(v) => { setReason(v); setPage(1); }}
        />
      </Flex>

      <Table<StockOut>
        rowKey="id"
        columns={columns}
        dataSource={data?.items}
        loading={isLoading}
        locale={{ emptyText: <EmptyHint filtered={!!(from || to || reason)} noun="phiếu xuất" actionLabel="Lập phiếu xuất" onAction={openCreate} /> }}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, showSizeChanger: false, hideOnSinglePage: true, onChange: setPage }}
      />

      <Modal
        title="Lập phiếu xuất kho"
        open={creating}
        width={720}
        okText="Lập phiếu"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
        forceRender
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) =>
            createMutation.mutate({
              reason: v.reason,
              note: v.note?.trim() || undefined,
              items: v.items.map((l) => ({ ingredientId: l.ingredientId!, quantity: l.quantity! })),
            })
          }
        >
          <Form.Item label="Lý do" name="reason" rules={[{ required: true, message: 'Vui lòng chọn lý do' }]}>
            <Select options={manualReasons.map((r) => ({ value: r, label: stockOutReasonLabel[r] }))} />
          </Form.Item>
          <Form.Item
            label="Ghi chú"
            name="note"
            rules={[{ required: selectedReason === 'DISCARD', whitespace: true, message: 'Vui lòng nhập ghi chú khi hủy nguyên liệu' }]}
          >
            <Input maxLength={255} />
          </Form.Item>

          <Form.List
            name="items"
            rules={[
              {
                validator: async (_, items: FormLine[] | undefined) => {
                  if (!(items ?? []).some((l) => l?.ingredientId)) throw new Error('Phiếu phải có ít nhất một nguyên liệu');
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field) => (
                  <Flex key={field.key} gap={8} align="start">
                    <Form.Item name={[field.name, 'ingredientId']} rules={[{ required: true, message: 'Chọn nguyên liệu' }]} style={{ flex: 1 }}>
                      <Select
                        placeholder="Nguyên liệu"
                        showSearch={{ optionFilterProp: 'label' }}
                        options={ingredients?.items.map((i) => ({
                          value: i.id,
                          label: `${i.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.name} — dùng được ${fmtNum(i.usableQty)}/${fmtNum(i.quantity)} ${i.unit}`,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name={[field.name, 'quantity']} rules={[{ required: true, message: 'Nhập số lượng' }]} style={{ width: 150 }}>
                      <InputNumber min={0.001} precision={3} placeholder="Số lượng" style={{ width: '100%' }} />
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Xóa dòng" disabled={fields.length === 1} onClick={() => remove(field.name)} />
                  </Flex>
                ))}
                <Form.ErrorList errors={errors} />
                <Button icon={<PlusOutlined />} onClick={() => add({})}>
                  Thêm dòng
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Hủy lô hết hạn"
        open={discardOpen}
        okText="Xác nhận hủy"
        okButtonProps={{ danger: true, disabled: expired.length === 0 }}
        cancelText="Đóng"
        confirmLoading={discardMutation.isPending}
        onOk={() => discardMutation.mutate()}
        onCancel={() => setDiscardOpen(false)}
      >
        {expired.length === 0 ? (
          <Typography.Text type="secondary">Không có lô nào hết hạn.</Typography.Text>
        ) : (
          <>
            <Typography.Paragraph>
              Toàn bộ lô đã hết hạn sẽ được trừ khỏi kho bằng một phiếu <b>Hủy</b> và tính vào hao hụt:
            </Typography.Paragraph>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={expired}
              columns={[
                { title: 'Nguyên liệu', render: (_, i) => `${i.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${i.name}` },
                { title: 'Lượng hủy', align: 'right', render: (_, i) => `${fmtNum(i.expiredQty)} ${i.unit}` },
                { title: 'Giá trị', align: 'right', render: (_, i) => fmtMoney(i.expiredQty * i.avgCost) },
              ]}
            />
          </>
        )}
      </Modal>

      <Drawer
        title={detail ? `Phiếu xuất ${detail.code}` : 'Phiếu xuất'}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        size={820}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Thời gian">{fmtDateTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Lý do">
                <Tag color={reasonColor[detail.reason]}>{stockOutReasonLabel[detail.reason]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Người lập">{detail.createdBy?.fullName ?? 'Hệ thống'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{detail.note ?? '—'}</Descriptions.Item>
              {(detail.prepBatch || detail.stockCount) && (
                <Descriptions.Item label="Phiếu liên quan">{detail.prepBatch?.code ?? detail.stockCount?.code}</Descriptions.Item>
              )}
            </Descriptions>
            <Table<StockOutItem> rowKey="id" size="small" pagination={false} columns={itemColumns} dataSource={detail.items} />
          </>
        )}
      </Drawer>
    </Card>
  );
}
