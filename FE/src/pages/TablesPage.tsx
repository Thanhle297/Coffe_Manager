import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Badge, Button, Card, Col, Dropdown, Empty, Flex, Row, Segmented, Spin, Typography } from 'antd';
import { ClockCircleOutlined, MoreOutlined, UserOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import { openOrder } from '../api/orders';
import { floorLabel, floorsOf, listTables, setTableStatus, tableStatusLabel, type DiningTable, type TableStatus } from '../api/tables';
import { colors } from '../theme';
import { fmtMoney } from '../utils/format';

const statusStyle: Record<TableStatus, { bg: string; border: string; badge: 'success' | 'warning' | 'error' }> = {
  AVAILABLE: { bg: '#F1F8F1', border: '#A5D6A7', badge: 'success' },
  SELECTING: { bg: '#FFF8E1', border: '#FFD54F', badge: 'warning' },
  OCCUPIED: { bg: '#FDECEA', border: '#EF9A9A', badge: 'error' },
};

const minutesSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

/** Sơ đồ bàn: trang chính khi bán hàng. */
export default function TablesPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['tables'], queryFn: () => listTables(), refetchInterval: 15_000 });
  const onError = (e: unknown) => message.error(getErrorMessage(e));
  const [floor, setFloor] = useState<number | 'all'>('all');
  const floors = floorsOf(data ?? []);
  const tables = (data ?? []).filter((t) => floor === 'all' || t.floor === floor);

  const openMutation = useMutation({
    mutationFn: openOrder,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.setQueryData(['order', order.id], order);
      navigate(`/orders/${order.id}`);
    },
    onError,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'AVAILABLE' | 'OCCUPIED' }) => setTableStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
    onError,
  });

  const onClick = (t: DiningTable) => {
    if (t.currentOrder) navigate(`/orders/${t.currentOrder.id}`);
    else openMutation.mutate(t.id);
  };

  const counts = tables.reduce<Record<TableStatus, number>>(
    (acc, t) => ({ ...acc, [t.status]: acc[t.status] + 1 }),
    { AVAILABLE: 0, SELECTING: 0, OCCUPIED: 0 },
  );

  return (
    <Flex vertical gap={16}>
      {floors.length > 1 && (
        <Segmented<number | 'all'>
          value={floor}
          onChange={setFloor}
          options={[{ value: 'all', label: 'Tất cả' }, ...floors.map((f) => ({ value: f, label: floorLabel(f) }))]}
        />
      )}
      <Flex gap={24} wrap>
        {(Object.keys(statusStyle) as TableStatus[]).map((s) => (
          <Badge key={s} status={statusStyle[s].badge} text={`${tableStatusLabel[s]}: ${counts[s]}`} />
        ))}
      </Flex>
      <Spin spinning={isLoading || openMutation.isPending}>
        {data && data.length === 0 ? (
          <Empty description="Chưa có bàn nào. Quản lý thêm bàn ở mục Quản lý bàn." />
        ) : (
          <Row gutter={[16, 16]}>
            {tables.map((t) => {
              const st = statusStyle[t.status];
              const o = t.currentOrder;
              return (
                <Col key={t.id} xs={12} sm={8} md={6} xl={4}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => onClick(t)}
                    style={{ background: st.bg, borderColor: st.border, minHeight: 130 }}
                    title={<Typography.Text strong style={{ fontSize: 16 }}>{t.name}</Typography.Text>}
                    extra={
                      !o && (
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              t.status === 'OCCUPIED'
                                ? { key: 'AVAILABLE', label: 'Đặt về trống' }
                                : { key: 'OCCUPIED', label: 'Đánh dấu có khách' },
                            ],
                            onClick: ({ key, domEvent }) => {
                              domEvent.stopPropagation();
                              statusMutation.mutate({ id: t.id, status: key as 'AVAILABLE' | 'OCCUPIED' });
                            },
                          }}
                        >
                          <Button size="small" type="text" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
                        </Dropdown>
                      )
                    }
                  >
                    <Flex vertical gap={4}>
                      <Badge status={st.badge} text={tableStatusLabel[t.status]} />
                      {o ? (
                        <>
                          <Typography.Text strong style={{ color: colors.brown }}>
                            {o.itemCount} ly · {fmtMoney(o.subtotal)}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined /> {minutesSince(o.createdAt)} phút
                            {o.customerName && (
                              <>
                                {' · '}
                                <UserOutlined /> {o.customerName}
                              </>
                            )}
                          </Typography.Text>
                        </>
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {floors.length > 1 && floor === 'all' ? `${floorLabel(t.floor)} · ` : ''}
                          {t.seats ? `${t.seats} chỗ · ` : ''}Bấm để mở đơn
                        </Typography.Text>
                      )}
                    </Flex>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>
    </Flex>
  );
}
