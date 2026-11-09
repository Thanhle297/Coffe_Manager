import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App as AntdApp,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Flex,
  InputNumber,
  Popconfirm,
  Result,
  Row,
  Select,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, PrinterOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import { listCustomers } from '../api/customers';
import type { MenuDrink } from '../api/drinks';
import {
  addOrderItem,
  cancelOrder,
  getOrder,
  orderStatusColor,
  orderStatusLabel,
  removeOrderItem,
  setOrderCustomer,
  updateOrderItem,
  updateOrderNote,
  type Order,
} from '../api/orders';
import DrinkOptionModal, { type DrinkSelection } from '../components/DrinkOptionModal';
import DrinkPicker from '../components/DrinkPicker';
import PayModal from '../components/PayModal';
import { ReceiptView } from '../components/ReceiptView';
import { colors } from '../theme';
import { fmtDateTime, fmtMoney } from '../utils/format';

/** Mọi thao tác sửa đơn trả về đơn mới nhất: ghi thẳng vào cache, làm mới sơ đồ bàn. */
function useOrderMutation<T>(id: number, onError: (e: unknown) => void, fn: (v: T) => Promise<Order>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (o: Order) => {
      queryClient.setQueryData(['order', id], o);
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError,
  });
}

/** Màn gọi món (POS) của một đơn. */
export default function OrderPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<MenuDrink | null>(null);
  const [paying, setPaying] = useState(false);

  const { data: order, isLoading, error } = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });

  const onError = (e: unknown) => {
    message.error(getErrorMessage(e));
    queryClient.invalidateQueries({ queryKey: ['order', id] });
  };

  const addMutation = useOrderMutation(id, onError, (sel: DrinkSelection) =>
    addOrderItem(id, { drinkId: sel.drinkId, sizeId: sel.sizeId, toppings: sel.toppings, quantity: sel.quantity, note: sel.note }),
  );
  const qtyMutation = useOrderMutation(id, onError, ({ itemId, quantity }: { itemId: number; quantity: number }) =>
    updateOrderItem(id, itemId, { quantity }),
  );
  const noteMutation = useOrderMutation(id, onError, ({ itemId, note }: { itemId: number; note: string }) =>
    updateOrderItem(id, itemId, { note: note.trim() || null }),
  );
  const removeMutation = useOrderMutation(id, onError, (itemId: number) => removeOrderItem(id, itemId));
  const customerMutation = useOrderMutation(id, onError, (customerId: number | null) => setOrderCustomer(id, customerId));
  const orderNoteMutation = useOrderMutation(id, onError, (note: string) => updateOrderNote(id, note.trim() || null));
  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: () => {
      message.success('Đã hủy đơn');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate('/tables');
    },
    onError,
  });

  // Tìm khách theo tên hoặc số điện thoại.
  const [customerQ, setCustomerQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(customerQ.trim()), 300);
    return () => clearTimeout(t);
  }, [customerQ]);
  const { data: customers, isFetching: searching } = useQuery({
    queryKey: ['customers', 'search', debouncedQ],
    queryFn: () => listCustomers({ q: debouncedQ, page: 1, pageSize: 10 }),
    enabled: debouncedQ.length >= 2,
  });

  if (isLoading) return <Spin style={{ display: 'block', marginTop: 80 }} />;
  if (error || !order) {
    return (
      <Result
        status="warning"
        title={getErrorMessage(error, 'Không tìm thấy đơn')}
        extra={<Button onClick={() => navigate('/tables')}>Về sơ đồ bàn</Button>}
      />
    );
  }

  const header = (
    <Flex align="center" gap={12} wrap>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tables')}>
        Sơ đồ bàn
      </Button>
      <Typography.Text strong style={{ fontSize: 16 }}>
        {order.table.name} · {order.code}
      </Typography.Text>
      <Tag color={orderStatusColor[order.status]}>{orderStatusLabel[order.status]}</Tag>
      <Typography.Text type="secondary">
        Mở lúc {fmtDateTime(order.createdAt)} bởi {order.staff.fullName}
      </Typography.Text>
    </Flex>
  );

  // Đơn đã đóng: chỉ xem và in.
  if (order.status !== 'OPEN') {
    return (
      <Flex vertical gap={16}>
        {header}
        <Card style={{ maxWidth: 420 }}>
          <ReceiptView order={order} />
          {order.status === 'PAID' && (
            <Button block type="primary" icon={<PrinterOutlined />} style={{ marginTop: 12 }} onClick={() => window.print()}>
              In hóa đơn
            </Button>
          )}
        </Card>
      </Flex>
    );
  }

  const busy = addMutation.isPending || qtyMutation.isPending || removeMutation.isPending;

  return (
    <Flex vertical gap={16}>
      {header}
      <Row gutter={16}>
        <Col xs={24} lg={15}>
          <Card size="small">
            <DrinkPicker onPick={setPicking} />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card size="small" title={`Đơn hàng (${order.itemCount} ly)`} style={{ position: 'sticky', top: 16 }}>
            <Flex vertical gap={12}>
              <Select
                showSearch
                allowClear
                filterOption={false}
                placeholder="Gắn khách: nhập tên hoặc số điện thoại"
                value={order.customer?.id}
                onSearch={setCustomerQ}
                onChange={(v) => customerMutation.mutate(v ?? null)}
                notFoundContent={searching ? <Spin size="small" /> : debouncedQ.length >= 2 ? 'Không tìm thấy' : null}
                options={[
                  ...(order.customer
                    ? [{ value: order.customer.id, label: `${order.customer.fullName} · ${order.customer.phone}` }]
                    : []),
                  ...(customers?.items ?? [])
                    .filter((c) => c.id !== order.customer?.id)
                    .map((c) => ({ value: c.id, label: `${c.fullName} · ${c.phone}` })),
                ]}
              />
              {order.customer && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Hạng {order.customer.customerType.name}
                  {order.customer.customerType.discountPercent > 0 && ` · giảm ${order.customer.customerType.discountPercent}%`}
                  {` · ${order.customer.points} điểm`}
                </Typography.Text>
              )}

              <Spin spinning={busy}>
                {order.items.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chọn món bên trái để thêm vào đơn" />
                ) : (
                  <Flex vertical gap={10}>
                    {order.items.map((i) => (
                      <div key={i.id} style={{ borderBottom: `1px solid ${colors.foam}`, paddingBottom: 8 }}>
                        <Flex justify="space-between" gap={8}>
                          <Typography.Text strong>
                            {i.drinkName}
                            <Typography.Text type="secondary"> · {i.sizeName}</Typography.Text>
                          </Typography.Text>
                          <Typography.Text strong>{fmtMoney(i.lineTotal)}</Typography.Text>
                        </Flex>
                        {i.toppings.length > 0 && (
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            + {i.toppings.map((t) => (t.quantity > 1 ? `${t.name} x${t.quantity}` : t.name)).join(', ')}
                          </Typography.Text>
                        )}
                        <Typography.Text
                          type="secondary"
                          italic
                          style={{ display: 'block', fontSize: 12 }}
                          editable={{
                            text: i.note ?? '',
                            tooltip: 'Sửa ghi chú',
                            maxLength: 255,
                            onChange: (note) => note !== (i.note ?? '') && noteMutation.mutate({ itemId: i.id, note }),
                          }}
                        >
                          {i.note || 'Thêm ghi chú'}
                        </Typography.Text>
                        <Flex justify="space-between" align="center" style={{ marginTop: 4 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {fmtMoney(i.unitPrice)} / ly
                          </Typography.Text>
                          <Flex gap={6} align="center">
                            <InputNumber
                              size="small"
                              min={1}
                              max={999}
                              precision={0}
                              value={i.quantity}
                              onChange={(v) => v && v !== i.quantity && qtyMutation.mutate({ itemId: i.id, quantity: v })}
                              style={{ width: 70 }}
                            />
                            <Button
                              size="small"
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                              aria-label="Xóa món"
                              onClick={() => removeMutation.mutate(i.id)}
                            />
                          </Flex>
                        </Flex>
                      </div>
                    ))}
                  </Flex>
                )}
              </Spin>

              <Typography.Text
                type="secondary"
                style={{ fontSize: 12 }}
                editable={{
                  text: order.note ?? '',
                  tooltip: 'Ghi chú đơn',
                  maxLength: 255,
                  onChange: (note) => note !== (order.note ?? '') && orderNoteMutation.mutate(note),
                }}
              >
                {order.note ? `Ghi chú đơn: ${order.note}` : 'Thêm ghi chú đơn'}
              </Typography.Text>

              <Divider style={{ margin: 0 }} />
              <Flex justify="space-between" align="center">
                <Typography.Text>Tạm tính</Typography.Text>
                <Typography.Text strong style={{ fontSize: 20, color: colors.brown }}>
                  {fmtMoney(order.subtotal)}
                </Typography.Text>
              </Flex>
              <Flex gap={8}>
                <Popconfirm
                  title="Hủy đơn này?"
                  description="Bàn sẽ trở về trống."
                  okText="Hủy đơn"
                  okButtonProps={{ danger: true }}
                  cancelText="Không"
                  onConfirm={() => cancelMutation.mutate()}
                >
                  <Button danger loading={cancelMutation.isPending}>
                    Hủy đơn
                  </Button>
                </Popconfirm>
                <Button
                  type="primary"
                  size="large"
                  style={{ flex: 1 }}
                  disabled={order.items.length === 0 || busy}
                  onClick={() => setPaying(true)}
                >
                  Thanh toán
                </Button>
              </Flex>
            </Flex>
          </Card>
        </Col>
      </Row>

      {picking && (
        <DrinkOptionModal
          drink={picking}
          onClose={() => setPicking(null)}
          onConfirm={(sel) => {
            setPicking(null);
            addMutation.mutate(sel);
          }}
        />
      )}
      <PayModal
        order={order}
        open={paying}
        onClose={() => setPaying(false)}
        onPaid={() => setPaying(false)}
      />
    </Flex>
  );
}
