import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Flex, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createTable,
  deleteTable,
  floorLabel,
  floorsOf,
  listTables,
  tableStatusLabel,
  updateTable,
  type DiningTable,
  type TableInput,
} from '../api/tables';

/** Quản lý bàn (chỉ Quản lý): thêm, sửa, sắp thứ tự, ẩn/hiện, xóa. */
export default function ManageTablesPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DiningTable | 'new' | null>(null);
  const [form] = Form.useForm<TableInput>();
  const [floorFilter, setFloorFilter] = useState<number>();

  const { data, isLoading } = useQuery({ queryKey: ['tables', 'all'], queryFn: () => listTables(true) });
  const floors = floorsOf(data ?? []);
  // Cho chọn các tầng đang có và thêm một tầng mới phía trên.
  const floorOptions = Array.from({ length: Math.max(0, ...floors) + 1 }, (_, i) => ({ value: i + 1, label: floorLabel(i + 1) }));
  const rows = floorFilter ? data?.filter((t) => t.floor === floorFilter) : data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tables'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (v: TableInput) => (editing && editing !== 'new' ? updateTable(editing.id, v) : createTable(v)),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm bàn' : 'Đã cập nhật bàn');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => updateTable(id, { isActive }),
    onSuccess: refresh,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTable,
    onSuccess: () => {
      message.success('Đã xóa bàn (bàn đã có hóa đơn sẽ chỉ bị ẩn)');
      refresh();
    },
    onError,
  });

  const openEditor = (t: DiningTable | 'new') => {
    form.resetFields();
    if (t === 'new') form.setFieldsValue({ floor: floorFilter ?? floors[0] ?? 1, sortOrder: (data?.length ?? 0) + 1 });
    else form.setFieldsValue({ name: t.name, floor: t.floor, seats: t.seats, sortOrder: t.sortOrder });
    setEditing(t);
  };

  const columns: TableProps<DiningTable>['columns'] = [
    { title: 'Tầng', dataIndex: 'floor', width: 100, render: floorLabel },
    { title: 'Thứ tự', dataIndex: 'sortOrder', width: 90 },
    {
      title: 'Tên bàn',
      render: (_, t) => (
        <span>
          <Typography.Text strong>{t.name}</Typography.Text>
          {!t.isActive && <Tag style={{ marginInlineStart: 8 }}>Đã ẩn</Tag>}
        </span>
      ),
    },
    { title: 'Số chỗ', dataIndex: 'seats', width: 100, render: (v: number | null) => v ?? '—' },
    { title: 'Trạng thái', width: 150, render: (_, t) => tableStatusLabel[t.status] },
    {
      title: 'Thao tác',
      width: 240,
      render: (_, t) => (
        <Flex gap={8}>
          <Button size="small" onClick={() => openEditor(t)}>
            Sửa
          </Button>
          <Button size="small" onClick={() => activeMutation.mutate({ id: t.id, isActive: !t.isActive })}>
            {t.isActive ? 'Ẩn' : 'Hiện'}
          </Button>
          <Popconfirm title={`Xóa ${t.name}?`} okText="Xóa" cancelText="Hủy" onConfirm={() => deleteMutation.mutate(t.id)}>
            <Button size="small" danger>
              Xóa
            </Button>
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <Card
      title="Danh sách bàn"
      extra={
        <Flex gap={8}>
          <Select<number>
            allowClear
            placeholder="Tất cả tầng"
            style={{ width: 140 }}
            value={floorFilter}
            onChange={setFloorFilter}
            options={floors.map((f) => ({ value: f, label: floorLabel(f) }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
            Thêm bàn
          </Button>
        </Flex>
      }
    >
      <Table rowKey="id" loading={isLoading} columns={columns} dataSource={rows} pagination={false} />
      <Modal
        title={editing === 'new' ? 'Thêm bàn' : 'Sửa bàn'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate({ ...v, seats: v.seats ?? null })}>
          <Form.Item name="name" label="Tên bàn" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên bàn' }]}>
            <Input maxLength={50} placeholder="Bàn 1" />
          </Form.Item>
          <Flex gap={16}>
            <Form.Item name="floor" label="Tầng" rules={[{ required: true, message: 'Vui lòng chọn tầng' }]} style={{ flex: 1 }}>
              <Select options={floorOptions} />
            </Form.Item>
            <Form.Item name="seats" label="Số chỗ" style={{ flex: 1 }}>
              <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="sortOrder" label="Thứ tự hiển thị" style={{ flex: 1 }}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
        </Form>
      </Modal>
    </Card>
  );
}
