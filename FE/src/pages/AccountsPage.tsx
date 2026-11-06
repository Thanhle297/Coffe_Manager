import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  createAccount,
  listAccounts,
  resetAccountPassword,
  updateAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '../api/accounts';
import { roleLabel, type Account, type Role } from '../api/auth';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { colors } from '../theme';

const roleOptions = (Object.keys(roleLabel) as Role[]).map((value) => ({
  value,
  label: roleLabel[value],
}));

const formatDate = (iso: string) => new Date(iso).toLocaleString('vi-VN');

export default function AccountsPage() {
  const { user: me } = useAuth();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<CreateAccountInput>();

  const { data, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounts'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      message.success('Đã tạo tài khoản');
      setCreating(false);
      form.resetFields();
      refresh();
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAccountInput }) => updateAccount(id, input),
    onSuccess: () => {
      message.success('Đã cập nhật tài khoản');
      refresh();
    },
    onError,
  });

  const resetMutation = useMutation({
    mutationFn: resetAccountPassword,
    onSuccess: ({ temporaryPassword }, id) => {
      const account = data?.find((a) => a.id === id);
      refresh();
      modal.success({
        title: 'Đã đặt lại mật khẩu',
        content: (
          <div>
            <p>
              Mật khẩu tạm của <b>{account?.fullName}</b> (chỉ hiển thị một lần, hãy gửi cho nhân viên):
            </p>
            <Typography.Text
              code
              copyable
              style={{ fontSize: 18, letterSpacing: 1, color: colors.brown }}
            >
              {temporaryPassword}
            </Typography.Text>
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              Nhân viên sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo.
            </p>
          </div>
        ),
        okText: 'Đã ghi lại',
      });
    },
    onError,
  });

  const columns: TableProps<Account>['columns'] = [
    {
      title: 'Tên đăng nhập',
      dataIndex: 'username',
      render: (value: string, record) => (
        <Flex vertical>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.fullName}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      width: 160,
      render: (role: Role, record) => (
        <Select
          value={role}
          options={roleOptions}
          style={{ width: 130 }}
          disabled={record.id === me?.id}
          loading={updateMutation.isPending && updateMutation.variables?.id === record.id}
          onChange={(next) => updateMutation.mutate({ id: record.id, input: { role: next } })}
        />
      ),
    },
    {
      title: 'Trạng thái',
      width: 160,
      render: (_, record) => {
        if (!record.isActive) return <Tag color="red">Đã khóa</Tag>;
        if (record.lockedUntil && new Date(record.lockedUntil) > new Date()) {
          return <Tag color="orange">Khóa tạm thời</Tag>;
        }
        if (record.mustChangePassword) return <Tag color="gold">Chờ đổi mật khẩu</Tag>;
        return <Tag color="green">Hoạt động</Tag>;
      },
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 170,
      responsive: ['md'],
      render: formatDate,
    },
    {
      title: 'Thao tác',
      width: 240,
      render: (_, record) => {
        const isSelf = record.id === me?.id;
        return (
          <Flex gap={8} wrap>
            <Popconfirm
              title="Đặt lại mật khẩu?"
              description="Hệ thống tạo mật khẩu tạm và đăng xuất tài khoản này."
              okText="Đặt lại"
              cancelText="Hủy"
              disabled={isSelf}
              onConfirm={() => resetMutation.mutate(record.id)}
            >
              <Button size="small" disabled={isSelf}>
                Đặt lại MK
              </Button>
            </Popconfirm>
            <Popconfirm
              title={record.isActive ? 'Khóa tài khoản này?' : 'Mở khóa tài khoản này?'}
              okText={record.isActive ? 'Khóa' : 'Mở khóa'}
              okButtonProps={{ danger: record.isActive }}
              cancelText="Hủy"
              disabled={isSelf}
              onConfirm={() =>
                updateMutation.mutate({ id: record.id, input: { isActive: !record.isActive } })
              }
            >
              <Button size="small" danger={record.isActive} disabled={isSelf}>
                {record.isActive ? 'Khóa' : 'Mở khóa'}
              </Button>
            </Popconfirm>
          </Flex>
        );
      },
    },
  ];

  return (
    <Card
      title="Quản lý tài khoản"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          Thêm tài khoản
        </Button>
      }
    >
      <Table<Account>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title="Thêm tài khoản"
        open={creating}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Form<CreateAccountInput>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ role: 'STAFF' }}
          onFinish={(values) => createMutation.mutate(values)}
        >
          <Form.Item
            label="Họ tên"
            name="fullName"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="Tên đăng nhập"
            name="username"
            rules={[
              { required: true, message: 'Vui lòng nhập tên đăng nhập' },
              { min: 3, message: 'Tối thiểu 3 ký tự' },
              { pattern: /^[A-Za-z0-9._-]+$/, message: 'Chỉ gồm chữ không dấu, số, . _ -' },
            ]}
          >
            <Input maxLength={50} autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Mật khẩu ban đầu"
            name="password"
            extra="Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên."
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
              { max: 72, message: 'Mật khẩu tối đa 72 ký tự' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="Vai trò" name="role">
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
