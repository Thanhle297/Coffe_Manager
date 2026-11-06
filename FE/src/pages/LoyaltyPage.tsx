import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Switch,
  Table,
  Tabs,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createCustomerType,
  deleteCustomerType,
  getLoyaltySettings,
  listCustomerTypes,
  updateCustomerType,
  updateLoyaltySettings,
  type CustomerType,
  type CustomerTypeInput,
  type LoyaltySetting,
} from '../api/customers';

export default function LoyaltyPage() {
  return (
    <Card title="Ưu đãi khách hàng">
      <Tabs
        items={[
          { key: 'types', label: 'Loại khách hàng', children: <CustomerTypesTab /> },
          { key: 'settings', label: 'Cấu hình tích điểm', children: <SettingsTab /> },
        ]}
      />
    </Card>
  );
}

function CustomerTypesTab() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CustomerType | 'new' | null>(null);
  const [form] = Form.useForm<CustomerTypeInput>();

  const { data, isLoading } = useQuery({ queryKey: ['customer-types'], queryFn: listCustomerTypes });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['customer-types'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] }); // hạng của khách có thể đổi
  };
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (v: CustomerTypeInput) =>
      editing && editing !== 'new' ? updateCustomerType(editing.id, v) : createCustomerType(v),
    onSuccess: () => {
      message.success('Đã lưu loại khách hàng');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomerType,
    onSuccess: () => {
      message.success('Đã xóa loại khách hàng');
      refresh();
    },
    onError,
  });

  const openEditor = (t: CustomerType | 'new') => {
    form.resetFields();
    if (t !== 'new') form.setFieldsValue({ name: t.name, minPoints: t.minPoints, discountPercent: t.discountPercent });
    setEditing(t);
  };

  const columns: TableProps<CustomerType>['columns'] = [
    { title: 'Tên loại', dataIndex: 'name' },
    { title: 'Điểm tích lũy từ', dataIndex: 'minPoints', align: 'right' },
    { title: 'Giảm giá', dataIndex: 'discountPercent', align: 'right', render: (v: number) => `${v}%` },
    { title: 'Số khách', dataIndex: 'customerCount', align: 'right' },
    {
      title: 'Thao tác',
      width: 160,
      render: (_, t) => (
        <Flex gap={8}>
          <Button size="small" onClick={() => openEditor(t)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa loại khách hàng này?"
            okText="Xóa"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
            onConfirm={() => deleteMutation.mutate(t.id)}
          >
            <Button size="small" danger>
              Xóa
            </Button>
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <>
      <Flex justify="flex-end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
          Thêm loại
        </Button>
      </Flex>
      <Table<CustomerType> rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} />
      <Modal
        title={editing === 'new' ? 'Thêm loại khách hàng' : 'Sửa loại khách hàng'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
      >
        <Form<CustomerTypeInput>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) => saveMutation.mutate(v)}
        >
          <Form.Item label="Tên loại" name="name" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item
            label="Điểm tích lũy tối thiểu"
            name="minPoints"
            rules={[{ required: true, message: 'Vui lòng nhập ngưỡng điểm' }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="Giảm giá (%)"
            name="discountPercent"
            rules={[{ required: true, message: 'Vui lòng nhập mức giảm' }]}
          >
            <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SettingsTab() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<LoyaltySetting>();
  const { data, isLoading } = useQuery({ queryKey: ['loyalty-settings'], queryFn: getLoyaltySettings });

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: updateLoyaltySettings,
    onSuccess: () => {
      message.success('Đã lưu cấu hình tích điểm');
      queryClient.invalidateQueries({ queryKey: ['loyalty-settings'] });
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  return (
    <Form<LoyaltySetting>
      form={form}
      layout="vertical"
      requiredMark={false}
      disabled={isLoading}
      style={{ maxWidth: 420 }}
      onFinish={(v) => saveMutation.mutate(v)}
    >
      <Form.Item label="Bật tích điểm" name="isEnabled" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item
        label="Số tiền thanh toán để được 1 điểm (đ)"
        name="amountPerPoint"
        rules={[{ required: true, message: 'Vui lòng nhập số tiền' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Giá trị quy đổi của 1 điểm (đ)"
        name="pointValue"
        rules={[{ required: true, message: 'Vui lòng nhập giá trị' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Giảm tối đa bằng điểm (% hóa đơn)"
        name="maxRedeemPercent"
        rules={[{ required: true, message: 'Vui lòng nhập tỷ lệ' }]}
      >
        <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Số điểm tối thiểu cho một lần đổi"
        name="minRedeemPoints"
        rules={[{ required: true, message: 'Vui lòng nhập số điểm' }]}
      >
        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
        Lưu cấu hình
      </Button>
    </Form>
  );
}
