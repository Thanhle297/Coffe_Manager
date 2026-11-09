import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { App as AntdApp, Card, DatePicker, Flex, Input, Segmented, Select, Statistic, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { getErrorMessage } from '../api/client';
import {
  getOrder,
  listOrders,
  orderStatusColor,
  orderStatusLabel,
  paymentLabel,
  type Order,
  type OrderListRow,
  type OrderStatus,
} from '../api/orders';
import { useAuth } from '../auth/useAuth';
import { ReceiptModal } from '../components/ReceiptView';
import { fmtDateTime, fmtMoney } from '../utils/format';

const PAGE_SIZE = 20;
type Mode = 'date' | 'month' | 'year';

const rangeOf = (mode: Mode, d: Dayjs | null) =>
  d
    ? { from: d.startOf(mode === 'date' ? 'day' : mode).format('YYYY-MM-DD'), to: d.endOf(mode === 'date' ? 'day' : mode).format('YYYY-MM-DD') }
    : {};

/** Tra cứu hóa đơn theo ngày/tháng/năm; Nhân viên chỉ thấy đơn của mình hôm nay. */
export default function OrdersHistoryPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const [mode, setMode] = useState<Mode>('date');
  const [day, setDay] = useState<Dayjs | null>(dayjs());
  const [status, setStatus] = useState<OrderStatus>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<Order | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    ...(isManager ? rangeOf(mode, day) : {}),
    status,
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading } = useQuery({ queryKey: ['orders', params], queryFn: () => listOrders(params) });

  const openReceipt = async (id: number) => {
    try {
      setReceipt(await getOrder(id));
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const columns: TableProps<OrderListRow>['columns'] = [
    { title: 'Mã', dataIndex: 'code', width: 170, render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Thời gian', dataIndex: 'createdAt', width: 150, render: fmtDateTime },
    { title: 'Bàn', render: (_, o) => o.table.name, width: 90 },
    { title: 'Khách', responsive: ['lg'], render: (_, o) => o.customer?.fullName ?? '—' },
    ...(isManager ? [{ title: 'Nhân viên', responsive: ['lg' as const], render: (_: unknown, o: OrderListRow) => o.staff.fullName }] : []),
    { title: 'Số ly', dataIndex: 'itemCount', width: 70, align: 'right' },
    {
      title: 'Tổng tiền',
      width: 130,
      align: 'right',
      render: (_, o) => fmtMoney(o.status === 'PAID' ? o.total : o.subtotal),
    },
    {
      title: 'Thanh toán',
      width: 120,
      responsive: ['md'],
      render: (_, o) => (o.paymentMethod ? paymentLabel[o.paymentMethod] : '—'),
    },
    {
      title: 'Trạng thái',
      width: 130,
      render: (_, o) => <Tag color={orderStatusColor[o.status]}>{orderStatusLabel[o.status]}</Tag>,
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Card size="small">
        <Flex gap={12} wrap align="center">
          {isManager ? (
            <>
              <Segmented<Mode>
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setPage(1);
                }}
                options={[
                  { value: 'date', label: 'Ngày' },
                  { value: 'month', label: 'Tháng' },
                  { value: 'year', label: 'Năm' },
                ]}
              />
              <DatePicker
                picker={mode}
                value={day}
                allowClear
                placeholder="Tất cả thời gian"
                format={mode === 'date' ? 'DD/MM/YYYY' : mode === 'month' ? 'MM/YYYY' : 'YYYY'}
                onChange={(d) => {
                  setDay(d);
                  setPage(1);
                }}
              />
            </>
          ) : (
            <Typography.Text type="secondary">Hóa đơn của bạn trong hôm nay</Typography.Text>
          )}
          <Select<OrderStatus>
            allowClear
            placeholder="Trạng thái"
            style={{ width: 160 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={(Object.keys(orderStatusLabel) as OrderStatus[]).map((s) => ({ value: s, label: orderStatusLabel[s] }))}
          />
          <Input.Search allowClear placeholder="Mã hóa đơn" style={{ width: 200 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        </Flex>
      </Card>
      <Flex gap={16} wrap>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Doanh thu (đơn đã thanh toán)" value={fmtMoney(data?.summary.revenue ?? 0)} />
        </Card>
        <Card size="small" style={{ minWidth: 200 }}>
          <Statistic title="Số hóa đơn đã thanh toán" value={data?.summary.paidCount ?? 0} />
        </Card>
      </Flex>
      <Card size="small">
        <Table
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items}
          onRow={(o) => ({ onClick: () => openReceipt(o.id), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, showSizeChanger: false }}
        />
      </Card>
      <ReceiptModal order={receipt} onClose={() => setReceipt(null)} />
    </Flex>
  );
}
