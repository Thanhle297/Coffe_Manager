import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  AutoComplete,
  Button,
  Card,
  DatePicker,
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
import dayjs, { type Dayjs } from 'dayjs';
import { listAccounts } from '../api/accounts';
import { getErrorMessage } from '../api/client';
import {
  createEmployee,
  deleteEmployee,
  employeeStatusLabel,
  genderLabel,
  linkEmployeeAccount,
  listEmployees,
  POSITIONS,
  updateEmployee,
  type Employee,
  type EmployeeInput,
  type EmployeeStatus,
} from '../api/employees';
import { fmtDate } from '../utils/format';

type FormValues = Omit<EmployeeInput, 'hireDate'> & { hireDate: Dayjs };

/** Hồ sơ nhân viên (chỉ Quản lý): thêm, sửa, tìm, gắn tài khoản, cho nghỉ việc. */
export default function EmployeesPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | undefined>('WORKING');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [linking, setLinking] = useState<Employee | null>(null);
  const [linkAccountId, setLinkAccountId] = useState<number | null>(null);
  const [form] = Form.useForm<FormValues>();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', q, status, page],
    queryFn: () => listEmployees({ q: q || undefined, status, page, pageSize: 20 }),
  });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts, enabled: !!linking });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['employees'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (v: EmployeeInput) => (editing && editing !== 'new' ? updateEmployee(editing.id, v) : createEmployee(v)),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm nhân viên' : 'Đã cập nhật nhân viên');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: (r) => {
      message.success(r.deleted ? 'Đã xóa nhân viên' : 'Nhân viên đã có chấm công nên được chuyển sang Đã nghỉ');
      refresh();
    },
    onError,
  });

  const linkMutation = useMutation({
    mutationFn: ({ id, accountId }: { id: number; accountId: number | null }) => linkEmployeeAccount(id, accountId),
    onSuccess: () => {
      message.success('Đã cập nhật tài khoản liên kết');
      setLinking(null);
      refresh();
    },
    onError,
  });

  const openEditor = (e: Employee | 'new') => {
    form.resetFields();
    if (e === 'new') form.setFieldsValue({ gender: 'MALE', hireDate: dayjs() });
    else
      form.setFieldsValue({
        fullName: e.fullName,
        gender: e.gender,
        position: e.position,
        phone: e.phone,
        address: e.address,
        hireDate: dayjs(e.hireDate),
        status: e.status,
      });
    setEditing(e);
  };

  const openLink = (e: Employee) => {
    setLinkAccountId(e.accountId);
    setLinking(e);
  };

  const columns: TableProps<Employee>['columns'] = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    {
      title: 'Họ tên',
      render: (_, e) => (
        <span>
          <Typography.Text strong>{e.fullName}</Typography.Text>
          {e.status === 'RESIGNED' && <Tag style={{ marginInlineStart: 8 }}>Đã nghỉ</Tag>}
        </span>
      ),
    },
    { title: 'Giới tính', dataIndex: 'gender', width: 90, render: (g: Employee['gender']) => genderLabel[g] },
    { title: 'Chức vụ', dataIndex: 'position', width: 130 },
    { title: 'Số điện thoại', dataIndex: 'phone', width: 130, render: (v: string | null) => v ?? '—' },
    { title: 'Ngày vào làm', dataIndex: 'hireDate', width: 120, render: fmtDate },
    {
      title: 'Tài khoản',
      width: 140,
      render: (_, e) => (e.account ? <Tag color={e.account.isActive ? 'blue' : 'default'}>{e.account.username}</Tag> : '—'),
    },
    {
      title: 'Thao tác',
      width: 230,
      render: (_, e) => (
        <Flex gap={8}>
          <Button size="small" onClick={() => openEditor(e)}>
            Sửa
          </Button>
          <Button size="small" onClick={() => openLink(e)}>
            Tài khoản
          </Button>
          <Popconfirm
            title={`Xóa ${e.fullName}?`}
            description="Đã có chấm công thì chuyển sang Đã nghỉ; tài khoản liên kết sẽ bị khóa."
            okText="Xóa"
            cancelText="Hủy"
            onConfirm={() => deleteMutation.mutate(e.id)}
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
    <Card
      title="Nhân viên"
      extra={
        <Flex gap={8}>
          <Input.Search
            allowClear
            placeholder="Tên, mã, số điện thoại"
            style={{ width: 240 }}
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
          />
          <Select<EmployeeStatus>
            allowClear
            placeholder="Tất cả trạng thái"
            style={{ width: 150 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={(Object.keys(employeeStatusLabel) as EmployeeStatus[]).map((s) => ({ value: s, label: employeeStatusLabel[s] }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
            Thêm nhân viên
          </Button>
        </Flex>
      }
    >
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage, showSizeChanger: false }}
      />

      <Modal
        title={editing === 'new' ? 'Thêm nhân viên' : `Sửa nhân viên ${editing && editing !== 'new' ? editing.code : ''}`}
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
              ...v,
              phone: v.phone ?? null,
              address: v.address ?? null,
              hireDate: v.hireDate.format('YYYY-MM-DD'),
            })
          }
        >
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Flex gap={16}>
            <Form.Item name="gender" label="Giới tính" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={Object.entries(genderLabel).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item
              name="position"
              label="Chức vụ"
              rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập chức vụ' }]}
              style={{ flex: 1 }}
            >
              <AutoComplete options={POSITIONS.map((p) => ({ value: p }))} maxLength={50} />
            </Form.Item>
          </Flex>
          <Flex gap={16}>
            <Form.Item
              name="phone"
              label="Số điện thoại"
              rules={[{ pattern: /^\s*(0\d{9})?\s*$/, message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0' }]}
              style={{ flex: 1 }}
            >
              <Input maxLength={15} />
            </Form.Item>
            <Form.Item name="hireDate" label="Ngày vào làm" rules={[{ required: true, message: 'Chọn ngày vào làm' }]} style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Form.Item name="address" label="Địa chỉ">
            <Input maxLength={255} />
          </Form.Item>
          {editing !== 'new' && (
            <Form.Item name="status" label="Trạng thái" extra="Chuyển sang Đã nghỉ sẽ khóa tài khoản liên kết.">
              <Select options={Object.entries(employeeStatusLabel).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`Tài khoản của ${linking?.fullName ?? ''}`}
        open={!!linking}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={linkMutation.isPending}
        onOk={() => linking && linkMutation.mutate({ id: linking.id, accountId: linkAccountId })}
        onCancel={() => setLinking(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Tài khoản là tùy chọn; tạo tài khoản mới ở trang Tài khoản rồi gắn vào đây.
        </Typography.Paragraph>
        <Select<number>
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Không gắn tài khoản"
          style={{ width: '100%' }}
          value={linkAccountId ?? undefined}
          onChange={(v) => setLinkAccountId(v ?? null)}
          options={accounts?.map((a) => ({
            value: a.id,
            label: `${a.username} (${a.fullName})${a.isActive ? '' : ' - đã khóa'}`,
          }))}
        />
      </Modal>
    </Card>
  );
}
