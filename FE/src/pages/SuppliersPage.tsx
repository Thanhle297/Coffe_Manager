import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
  type Supplier,
  type SupplierInput,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import EmptyHint from '../components/EmptyHint';

const PAGE_SIZE = 10;
type StatusFilter = 'active' | 'inactive' | 'all';

export default function SuppliersPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [form] = Form.useForm<SupplierInput>();

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const isActive = status === 'all' ? undefined : status === 'active';
  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', { q, isActive, page }],
    queryFn: () => listSuppliers({ q: q || undefined, isActive, page, pageSize: PAGE_SIZE }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (values: SupplierInput) =>
      editing && editing !== 'new' ? updateSupplier(editing.id, values) : createSupplier(values),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm nhà cung cấp' : 'Đã cập nhật nhà cung cấp');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      message.success('Đã xóa nhà cung cấp');
      refresh();
    },
    onError,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => updateSupplier(id, { isActive: true }),
    onSuccess: () => {
      message.success('Đã kích hoạt lại nhà cung cấp');
      refresh();
    },
    onError,
  });

  const openEditor = (supplier: Supplier | 'new') => {
    form.resetFields();
    if (supplier !== 'new') {
      form.setFieldsValue({
        name: supplier.name,
        address: supplier.address ?? '',
        email: supplier.email ?? '',
        phone: supplier.phone ?? '',
        description: supplier.description ?? '',
      });
    }
    setEditing(supplier);
  };

  const blankToNull = (v?: string | null) => (v?.trim() ? v.trim() : null);

  const columns: TableProps<Supplier>['columns'] = [
    {
      title: 'Nhà cung cấp',
      render: (_, s) => (
        <span>
          <Typography.Text strong>{s.name}</Typography.Text>
          {!s.isActive && <Tag style={{ marginInlineStart: 8 }}>Đã ẩn</Tag>}
        </span>
      ),
    },
    { title: 'Số điện thoại', dataIndex: 'phone', width: 140, render: (v: string | null) => v ?? '—' },
    { title: 'Email', dataIndex: 'email', responsive: ['lg'], render: (v: string | null) => v ?? '—' },
    { title: 'Địa chỉ', dataIndex: 'address', responsive: ['lg'], render: (v: string | null) => v ?? '—' },
    ...(isManager
      ? [
          {
            title: 'Thao tác',
            width: 200,
            render: (_: unknown, s: Supplier) => (
              <Flex gap={8}>
                <Button size="small" onClick={() => openEditor(s)}>
                  Sửa
                </Button>
                {s.isActive ? (
                  <Popconfirm
                    title="Xóa nhà cung cấp này?"
                    description="Nếu đã có phiếu nhập, nhà cung cấp chỉ bị ẩn đi."
                    okText="Xóa"
                    okButtonProps={{ danger: true }}
                    cancelText="Hủy"
                    onConfirm={() => deleteMutation.mutate(s.id)}
                  >
                    <Button size="small" danger>
                      Xóa
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" onClick={() => restoreMutation.mutate(s.id)}>
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
      title="Nhà cung cấp"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
            Thêm nhà cung cấp
          </Button>
        )
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
        <Select<StatusFilter>
          style={{ width: 160 }}
          value={status}
          options={[
            { value: 'active', label: 'Đang hoạt động' },
            { value: 'inactive', label: 'Đã ẩn' },
            { value: 'all', label: 'Tất cả' },
          ]}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </Flex>

      <Table<Supplier>
        rowKey="id"
        columns={columns}
        dataSource={data?.items}
        loading={isLoading}
        locale={{ emptyText: <EmptyHint filtered={!!(q || status !== 'active')} noun="nhà cung cấp" actionLabel="Thêm nhà cung cấp" onAction={isManager ? () => openEditor('new') : undefined} /> }}
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
        title={editing === 'new' ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
      >
        <Form<SupplierInput>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) =>
            saveMutation.mutate({
              name: v.name,
              address: blankToNull(v.address),
              email: blankToNull(v.email),
              phone: blankToNull(v.phone),
              description: blankToNull(v.description),
            })
          }
        >
          <Form.Item
            label="Tên nhà cung cấp"
            name="name"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên nhà cung cấp' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="Số điện thoại"
            name="phone"
            rules={[{ pattern: /^\+?\d{8,15}$/, transform: (v: string) => v?.replace(/\s+/g, ''), message: 'Số điện thoại gồm 8-15 chữ số' }]}
          >
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="Địa chỉ" name="address">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="Mô tả" name="description">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
