import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Flex, Form, Input, InputNumber, Modal, Popconfirm, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createDrinkCategory,
  deleteDrinkCategory,
  listDrinkCategories,
  updateDrinkCategory,
  type DrinkCategory,
  type DrinkCategoryInput,
} from '../api/drinks';
import { useAuth } from '../auth/useAuth';

export default function DrinkCategoriesPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DrinkCategory | 'new' | null>(null);
  const [form] = Form.useForm<DrinkCategoryInput>();

  const { data, isLoading } = useQuery({ queryKey: ['drink-categories'], queryFn: listDrinkCategories });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['drink-categories'] });
    queryClient.invalidateQueries({ queryKey: ['drinks'] });
  };
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (v: DrinkCategoryInput) =>
      editing && editing !== 'new' ? updateDrinkCategory(editing.id, v) : createDrinkCategory(v),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm danh mục' : 'Đã cập nhật danh mục');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDrinkCategory,
    onSuccess: () => {
      message.success('Đã xóa danh mục');
      refresh();
    },
    onError,
  });

  const openEditor = (c: DrinkCategory | 'new') => {
    form.resetFields();
    form.setFieldsValue(
      c === 'new' ? { name: '', sortOrder: (data?.length ?? 0) } : { name: c.name, sortOrder: c.sortOrder },
    );
    setEditing(c);
  };

  const columns: TableProps<DrinkCategory>['columns'] = [
    { title: 'Thứ tự', dataIndex: 'sortOrder', width: 90, align: 'right' },
    { title: 'Tên danh mục', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Số món', dataIndex: 'drinkCount', width: 120, align: 'right' },
    ...(isManager
      ? [
          {
            title: 'Thao tác',
            width: 160,
            render: (_: unknown, c: DrinkCategory) => (
              <Flex gap={8}>
                <Button size="small" onClick={() => openEditor(c)}>
                  Sửa
                </Button>
                <Popconfirm
                  title="Xóa danh mục này?"
                  okText="Xóa"
                  okButtonProps={{ danger: true }}
                  cancelText="Hủy"
                  disabled={!!c.drinkCount}
                  onConfirm={() => deleteMutation.mutate(c.id)}
                >
                  <Button
                    size="small"
                    danger
                    disabled={!!c.drinkCount}
                    title={c.drinkCount ? 'Danh mục còn món, hãy chuyển món sang danh mục khác trước' : undefined}
                  >
                    Xóa
                  </Button>
                </Popconfirm>
              </Flex>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title="Danh mục đồ uống"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
            Thêm danh mục
          </Button>
        )
      }
    >
      <Table<DrinkCategory> rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} />

      <Modal
        title={editing === 'new' ? 'Thêm danh mục' : 'Sửa danh mục'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
      >
        <Form<DrinkCategoryInput> form={form} layout="vertical" requiredMark={false} onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item label="Tên danh mục" name="name" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên danh mục' }]}>
            <Input maxLength={50} placeholder="Ví dụ: Cà phê, Trà, Trà sữa" />
          </Form.Item>
          <Form.Item label="Thứ tự hiển thị (nhỏ đứng trước)" name="sortOrder" rules={[{ required: true, message: 'Nhập thứ tự' }]}>
            <InputNumber min={0} max={9999} precision={0} style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
