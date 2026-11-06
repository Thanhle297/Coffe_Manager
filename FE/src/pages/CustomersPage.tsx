import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import { GiftOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  adjustPoints,
  createCustomer,
  deleteCustomer,
  getPointHistory,
  listCustomers,
  listCustomerTypes,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type PointLog,
  type PointReason,
} from '../api/customers';
import { useAuth } from '../auth/useAuth';
import DateField from '../components/DateField';
import EmptyHint from '../components/EmptyHint';

const PAGE_SIZE = 10;
const reasonLabel: Record<PointReason, string> = { EARN: 'Tích điểm', REDEEM: 'Đổi điểm', ADJUST: 'Điều chỉnh' };

const isBirthdayToday = (birthday: string | null) => {
  if (!birthday) return false;
  const now = new Date();
  const [, m, d] = birthday.split('-').map(Number);
  return m === now.getMonth() + 1 && d === now.getDate();
};

const BirthdayTag = ({ birthday }: { birthday: string | null }) =>
  isBirthdayToday(birthday) ? (
    <Tag color="magenta" icon={<GiftOutlined />} style={{ marginInlineStart: 8 }}>
      Sinh nhật hôm nay
    </Tag>
  ) : null;

export default function CustomersPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState<number>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form] = Form.useForm<CustomerInput>();

  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { q, typeId, page }],
    queryFn: () => listCustomers({ q: q || undefined, typeId, page, pageSize: PAGE_SIZE }),
  });
  const { data: types } = useQuery({ queryKey: ['customer-types'], queryFn: listCustomerTypes });

  const detail = data?.items.find((c) => c.id === detailId) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customers'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (values: CustomerInput) =>
      editing && editing !== 'new' ? updateCustomer(editing.id, values) : createCustomer(values),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm khách hàng' : 'Đã cập nhật khách hàng');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      message.success('Đã xóa khách hàng');
      setDetailId(null);
      refresh();
    },
    onError,
  });

  const openEditor = (customer: Customer | 'new') => {
    form.resetFields();
    if (customer !== 'new') {
      form.setFieldsValue({
        fullName: customer.fullName,
        phone: customer.phone,
        address: customer.address ?? '',
        birthday: customer.birthday ?? '',
      });
    }
    setEditing(customer);
  };

  const submit = (values: CustomerInput) =>
    saveMutation.mutate({
      ...values,
      address: values.address?.trim() ? values.address : null,
      birthday: values.birthday?.trim() ? values.birthday : null,
    });

  const columns: TableProps<Customer>['columns'] = [
    {
      title: 'Khách hàng',
      render: (_, c) => (
        <Flex vertical>
          <span>
            <Typography.Text strong>{c.fullName}</Typography.Text>
            <BirthdayTag birthday={c.birthday} />
          </span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {c.phone}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: 'Hạng',
      width: 140,
      render: (_, c) => (
        <Tag color="gold">
          {c.customerType.name} · {c.customerType.discountPercent}%
        </Tag>
      ),
    },
    { title: 'Điểm', dataIndex: 'points', width: 100, align: 'right' },
    { title: 'Địa chỉ', dataIndex: 'address', responsive: ['lg'], render: (v: string | null) => v ?? '—' },
    {
      title: 'Thao tác',
      width: 160,
      render: (_, c) => (
        <Flex gap={8}>
          <Button size="small" onClick={() => setDetailId(c.id)}>
            Chi tiết
          </Button>
          <Button size="small" onClick={() => openEditor(c)}>
            Sửa
          </Button>
        </Flex>
      ),
    },
  ];

  return (
    <Card
      title="Khách hàng"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
          Thêm khách hàng
        </Button>
      }
    >
      <Flex gap={12} wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="Tìm theo tên hoặc số điện thoại"
          style={{ width: 320 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          allowClear
          placeholder="Tất cả hạng"
          style={{ width: 180 }}
          value={typeId}
          options={types?.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => {
            setTypeId(v);
            setPage(1);
          }}
        />
      </Flex>

      <Table<Customer>
        rowKey="id"
        columns={columns}
        dataSource={data?.items}
        loading={isLoading}
        locale={{ emptyText: <EmptyHint filtered={!!(q || typeId)} noun="khách hàng" actionLabel="Thêm khách hàng" onAction={() => openEditor('new')} /> }}
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

      <Modal
        title={editing === 'new' ? 'Thêm khách hàng' : 'Sửa khách hàng'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
      >
        <Form<CustomerInput> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item
            label="Họ tên"
            name="fullName"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="Số điện thoại"
            name="phone"
            rules={[
              { required: true, message: 'Vui lòng nhập số điện thoại' },
              {
                pattern: /^0\d{9}$/,
                transform: (v: string) => v?.replace(/\s+/g, ''),
                message: 'Số điện thoại gồm 10 chữ số và bắt đầu bằng 0',
              },
            ]}
          >
            <Input maxLength={14} />
          </Form.Item>
          <Form.Item label="Địa chỉ" name="address">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="Ngày sinh" name="birthday">
            <DateField max={new Date().toLocaleDateString('en-CA')} />
          </Form.Item>
        </Form>
      </Modal>

      <CustomerDrawer
        customer={detail}
        isManager={isManager}
        onClose={() => setDetailId(null)}
        onDelete={(id) => deleteMutation.mutate(id)}
        onChanged={refresh}
      />
    </Card>
  );
}

function CustomerDrawer({
  customer,
  isManager,
  onClose,
  onDelete,
  onChanged,
}: {
  customer: Customer | null;
  isManager: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
  onChanged: () => void;
}) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [logPage, setLogPage] = useState(1);
  const [adjusting, setAdjusting] = useState(false);
  const [form] = Form.useForm<{ delta: number; note: string }>();
  const id = customer?.id;

  const { data: logs, isLoading } = useQuery({
    queryKey: ['point-logs', id, logPage],
    queryFn: () => getPointHistory(id!, logPage),
    enabled: id !== undefined,
  });

  const adjustMutation = useMutation({
    mutationFn: (v: { delta: number; note: string }) => adjustPoints(id!, v),
    onSuccess: () => {
      message.success('Đã điều chỉnh điểm');
      setAdjusting(false);
      queryClient.invalidateQueries({ queryKey: ['point-logs', id] });
      onChanged();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const logColumns: TableProps<PointLog>['columns'] = [
    { title: 'Thời gian', dataIndex: 'createdAt', width: 150, render: (v: string) => new Date(v).toLocaleString('vi-VN') },
    { title: 'Loại', dataIndex: 'reason', width: 100, render: (r: PointReason) => reasonLabel[r] },
    {
      title: 'Điểm',
      dataIndex: 'delta',
      width: 80,
      align: 'right',
      render: (d: number) => <Typography.Text type={d > 0 ? 'success' : 'danger'}>{d > 0 ? `+${d}` : d}</Typography.Text>,
    },
    { title: 'Ghi chú', dataIndex: 'note', render: (v: string | null) => v ?? '—' },
  ];

  return (
    <Drawer
      title={customer ? <>{customer.fullName}<BirthdayTag birthday={customer.birthday} /></> : ''}
      open={customer !== null}
      onClose={onClose}
      size={560}
      destroyOnHidden
      extra={
        isManager && customer ? (
          <Popconfirm
            title="Xóa khách hàng này?"
            description="Lịch sử điểm cũng bị xóa."
            okText="Xóa"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
            onConfirm={() => onDelete(customer.id)}
          >
            <Button danger>Xóa</Button>
          </Popconfirm>
        ) : null
      }
    >
      {customer && (
        <>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Số điện thoại">{customer.phone}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ">{customer.address ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">
              {customer.birthday ? customer.birthday.split('-').reverse().join('/') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Hạng">
              {customer.customerType.name} (giảm {customer.customerType.discountPercent}%)
            </Descriptions.Item>
            <Descriptions.Item label="Điểm hiện có">{customer.points}</Descriptions.Item>
            <Descriptions.Item label="Điểm tích lũy">{customer.lifetimePoints}</Descriptions.Item>
          </Descriptions>
          <Tabs
            items={[
              {
                key: 'points',
                label: 'Lịch sử điểm',
                children: (
                  <>
                    {isManager && (
                      <Button style={{ marginBottom: 12 }} onClick={() => { form.resetFields(); setAdjusting(true); }}>
                        Điều chỉnh điểm
                      </Button>
                    )}
                    <Table<PointLog>
                      rowKey="id"
                      size="small"
                      columns={logColumns}
                      dataSource={logs?.items}
                      loading={isLoading}
                      pagination={{
                        current: logPage,
                        pageSize: 10,
                        total: logs?.total,
                        showSizeChanger: false,
                        hideOnSinglePage: true,
                        onChange: setLogPage,
                      }}
                    />
                  </>
                ),
              },
              {
                key: 'orders',
                label: 'Lịch sử mua hàng',
                children: <Typography.Text type="secondary">Sẽ có khi hoàn thành phân hệ Đặt hàng.</Typography.Text>,
              },
            ]}
          />
          <Modal
            title="Điều chỉnh điểm"
            open={adjusting}
            okText="Lưu"
            cancelText="Hủy"
            confirmLoading={adjustMutation.isPending}
            onOk={() => form.submit()}
            onCancel={() => setAdjusting(false)}
            destroyOnHidden
            forceRender
          >
            <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => adjustMutation.mutate(v)}>
              <Form.Item
                label="Số điểm (âm để trừ)"
                name="delta"
                rules={[
                  { required: true, message: 'Vui lòng nhập số điểm' },
                  { type: 'integer', message: 'Phải là số nguyên' },
                  { validator: (_, v) => (v === 0 ? Promise.reject(new Error('Số điểm phải khác 0')) : Promise.resolve()) },
                ]}
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="Lý do"
                name="note"
                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập lý do' }]}
              >
                <Input maxLength={255} />
              </Form.Item>
            </Form>
          </Modal>
        </>
      )}
    </Drawer>
  );
}
