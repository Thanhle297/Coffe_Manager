import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Flex, Form, Input, Modal, Popconfirm, Table, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createIngredientCategory,
  deleteIngredientCategory,
  listIngredientCategories,
  updateIngredientCategory,
  type IngredientCategory,
  type IngredientCategoryInput,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import { colors } from '../theme';

// Bộ icon nguyên liệu quán cà phê, chia nhóm; Quản lý vẫn có thể gõ emoji bất kỳ vào ô icon.
const ICON_GROUPS: { title: string; icons: [string, string][] }[] = [
  {
    title: 'Cà phê, trà, cacao',
    icons: [
      ['☕', 'Cà phê'], ['🫘', 'Hạt cà phê'], ['🍵', 'Trà'], ['🍃', 'Matcha, lá trà'],
      ['🫖', 'Trà túi lọc'], ['🍫', 'Cacao, socola'], ['🌿', 'Bạc hà, thảo mộc'],
    ],
  },
  {
    title: 'Sữa, kem',
    icons: [
      ['🥛', 'Sữa'], ['🥫', 'Sữa đặc'], ['🍦', 'Kem tươi, whipping'], ['🧀', 'Kem phô mai'],
      ['🧈', 'Bơ'], ['🥥', 'Nước cốt dừa'], ['🥚', 'Trứng'],
    ],
  },
  {
    title: 'Đường, siro, gia vị',
    icons: [['🍬', 'Đường'], ['🍯', 'Mật ong, siro'], ['🍮', 'Caramel'], ['🧂', 'Muối'], ['🫚', 'Gừng'], ['🌰', 'Hạt']],
  },
  {
    title: 'Trái cây',
    icons: [
      ['🍋', 'Chanh'], ['🍊', 'Cam, tắc'], ['🍑', 'Đào'], ['🍓', 'Dâu'], ['🥭', 'Xoài'], ['🍍', 'Dứa'],
      ['🫐', 'Việt quất'], ['🍌', 'Chuối'], ['🥝', 'Kiwi'], ['🍉', 'Dưa hấu'], ['🍎', 'Táo'], ['🍇', 'Nho'],
    ],
  },
  {
    title: 'Topping, đá',
    icons: [['🧋', 'Trân châu'], ['🟫', 'Thạch, sương sáo'], ['🍡', 'Thạch, viên'], ['🧊', 'Đá'], ['💧', 'Nước']],
  },
  {
    title: 'Bánh',
    icons: [['🥐', 'Bánh sừng bò'], ['🍰', 'Bánh ngọt'], ['🍪', 'Bánh quy'], ['🍞', 'Bánh mì'], ['🧁', 'Cupcake']],
  },
  {
    title: 'Bao bì, dụng cụ',
    icons: [['🥤', 'Ly nhựa'], ['🥡', 'Hộp mang đi'], ['🛍️', 'Túi'], ['🥄', 'Muỗng, ống hút'], ['🧻', 'Khăn giấy'], ['📦', 'Khác']],
  },
];
const DEFAULT_PRESET = ICON_GROUPS[0].icons[0][0];

export default function IngredientCategoriesPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<IngredientCategory | 'new' | null>(null);
  const [form] = Form.useForm<IngredientCategoryInput>();
  const icon = Form.useWatch('icon', form);

  const { data, isLoading } = useQuery({ queryKey: ['ingredient-categories'], queryFn: listIngredientCategories });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ingredient-categories'] });
    queryClient.invalidateQueries({ queryKey: ['ingredients'] });
  };
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const saveMutation = useMutation({
    mutationFn: (v: IngredientCategoryInput) =>
      editing && editing !== 'new' ? updateIngredientCategory(editing.id, v) : createIngredientCategory(v),
    onSuccess: () => {
      message.success(editing === 'new' ? 'Đã thêm loại nguyên liệu' : 'Đã cập nhật loại nguyên liệu');
      setEditing(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIngredientCategory,
    onSuccess: () => {
      message.success('Đã xóa loại nguyên liệu');
      refresh();
    },
    onError,
  });

  const openEditor = (c: IngredientCategory | 'new') => {
    form.resetFields();
    form.setFieldsValue(c === 'new' ? { name: '', icon: DEFAULT_PRESET } : { name: c.name, icon: c.icon });
    setEditing(c);
  };

  const columns: TableProps<IngredientCategory>['columns'] = [
    { title: 'Icon', dataIndex: 'icon', width: 70, align: 'center', render: (v: string) => <span style={{ fontSize: 22 }}>{v}</span> },
    { title: 'Tên loại', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Số nguyên liệu', dataIndex: 'ingredientCount', width: 140, align: 'right' },
    ...(isManager
      ? [
          {
            title: 'Thao tác',
            width: 160,
            render: (_: unknown, c: IngredientCategory) => (
              <Flex gap={8}>
                <Button size="small" onClick={() => openEditor(c)}>
                  Sửa
                </Button>
                <Popconfirm
                  title="Xóa loại nguyên liệu này?"
                  okText="Xóa"
                  okButtonProps={{ danger: true }}
                  cancelText="Hủy"
                  disabled={!!c.ingredientCount}
                  onConfirm={() => deleteMutation.mutate(c.id)}
                >
                  <Button
                    size="small"
                    danger
                    disabled={!!c.ingredientCount}
                    title={c.ingredientCount ? 'Loại đang được dùng, hãy chuyển nguyên liệu sang loại khác trước' : undefined}
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
      title="Loại nguyên liệu"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
            Thêm loại
          </Button>
        )
      }
    >
      <Table<IngredientCategory> rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} />

      <Modal
        title={editing === 'new' ? 'Thêm loại nguyên liệu' : 'Sửa loại nguyên liệu'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saveMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        forceRender
      >
        <Form<IngredientCategoryInput> form={form} layout="vertical" requiredMark={false} onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item label="Tên loại" name="name" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên loại' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item
            label="Icon (chọn bên dưới hoặc gõ emoji)"
            name="icon"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng chọn icon' }]}
          >
            <Input maxLength={16} style={{ width: 120, fontSize: 20, textAlign: 'center' }} />
          </Form.Item>
          <div
            style={{
              maxHeight: 260,
              overflowY: 'auto',
              border: `1px solid ${colors.latte}`,
              borderRadius: 8,
              padding: '0 12px 12px',
            }}
          >
            {ICON_GROUPS.map((g) => (
              <div key={g.title}>
                {/* Tiêu đề nhóm dính ở đầu khung khi cuộn. */}
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', position: 'sticky', top: 0, zIndex: 1, padding: '8px 0 4px', fontSize: 12, background: '#fff' }}
                >
                  {g.title}
                </Typography.Text>
                <Flex wrap gap={6}>
                  {g.icons.map(([e, label]) => (
                    <Tooltip key={e} title={label}>
                      <Button
                        type={icon === e ? 'primary' : 'default'}
                        aria-label={label}
                        style={{ width: 40, height: 40, fontSize: 20, padding: 0 }}
                        onClick={() => form.setFieldValue('icon', e)}
                      >
                        {e}
                      </Button>
                    </Tooltip>
                  ))}
                </Flex>
              </div>
            ))}
          </div>
        </Form>
      </Modal>
    </Card>
  );
}
