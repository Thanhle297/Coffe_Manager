import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Flex, Form, Input, InputNumber, Modal, Popconfirm, Table, Tag, TimePicker, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { getErrorMessage } from '../api/client';
import { createShift, deleteShift, listShifts, shiftTimeLabel, updateShift, type Shift, type ShiftInput } from '../api/employees';
import { fmtMoney } from '../utils/format';

interface FormValues {
  name: string;
  startTime: Dayjs;
  endTime: Dayjs;
  pay: number;
}

const toHm = (t: string) => dayjs().hour(Number(t.slice(0, 2))).minute(Number(t.slice(3, 5))).second(0);

/** Ca làm việc (chỉ Quản lý). Đổi tiền ca không ảnh hưởng chấm công đã lưu. */
export default function ShiftsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();

  const { data, isLoading } = useQuery({ queryKey: ['shifts', 'all'], queryFn: () => listShifts(true) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shifts'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (v: ShiftInput) => (editing && editing !== 'new' ? updateShift(editing.id, v) : createShift(v)),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm ca' : 'Đã cập nhật ca');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => updateShift(id, { isActive }),
    onSuccess: refresh,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteShift,
    onSuccess: (r) => {
      message.success(r.deleted ? 'Đã xóa ca' : 'Ca đã có chấm công nên chỉ ngừng sử dụng');
      refresh();
    },
    onError,
  });

  const openEditor = (s: Shift | 'new') => {
    form.resetFields();
    if (s !== 'new') form.setFieldsValue({ name: s.name, startTime: toHm(s.startTime), endTime: toHm(s.endTime), pay: s.pay });
    setEditing(s);
  };

  const columns: TableProps<Shift>['columns'] = [
    {
      title: 'Tên ca',
      render: (_, s) => (
        <span>
          <Typography.Text strong>{s.name}</Typography.Text>
          {!s.isActive && <Tag style={{ marginInlineStart: 8 }}>Ngừng dùng</Tag>}
        </span>
      ),
    },
    { title: 'Giờ làm', width: 180, render: (_, s) => shiftTimeLabel(s) },
    { title: 'Tiền một ca', dataIndex: 'pay', width: 150, align: 'right', render: fmtMoney },
    {
      title: 'Thao tác',
      width: 240,
      render: (_, s) => (
        <Flex gap={8}>
          <Button size="small" onClick={() => openEditor(s)}>
            Sửa
          </Button>
          <Button size="small" onClick={() => activeMutation.mutate({ id: s.id, isActive: !s.isActive })}>
            {s.isActive ? 'Ngừng dùng' : 'Dùng lại'}
          </Button>
          <Popconfirm title={`Xóa ${s.name}?`} okText="Xóa" cancelText="Hủy" onConfirm={() => deleteMutation.mutate(s.id)}>
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
      title="Ca làm việc"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
          Thêm ca
        </Button>
      }
    >
      <Table rowKey="id" loading={isLoading} columns={columns} dataSource={data} pagination={false} />
      <Modal
        title={editing === 'new' ? 'Thêm ca' : 'Sửa ca'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) =>
            saveMutation.mutate({
              name: v.name,
              startTime: v.startTime.format('HH:mm'),
              endTime: v.endTime.format('HH:mm'),
              pay: v.pay,
            })
          }
        >
          <Form.Item name="name" label="Tên ca" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên ca' }]}>
            <Input maxLength={50} placeholder="Ca sáng" />
          </Form.Item>
          <Flex gap={16}>
            <Form.Item name="startTime" label="Bắt đầu" rules={[{ required: true, message: 'Chọn giờ bắt đầu' }]} style={{ flex: 1 }}>
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="Kết thúc"
              dependencies={['startTime']}
              extra="Sớm hơn giờ bắt đầu nghĩa là ca qua đêm."
              rules={[
                { required: true, message: 'Chọn giờ kết thúc' },
                ({ getFieldValue }) => ({
                  validator: (_, v: Dayjs | undefined) =>
                    v && getFieldValue('startTime')?.format('HH:mm') === v.format('HH:mm')
                      ? Promise.reject(new Error('Giờ kết thúc phải khác giờ bắt đầu'))
                      : Promise.resolve(),
                }),
              ]}
              style={{ flex: 1 }}
            >
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Form.Item name="pay" label="Tiền một ca (₫)" rules={[{ required: true, message: 'Nhập tiền ca' }]}>
            <InputNumber
              min={0}
              step={10000}
              precision={0}
              style={{ width: '100%' }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(v) => Number((v ?? '').replace(/\./g, '')) as 0}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
