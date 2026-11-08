import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Tabs,
  Typography,
  Upload,
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { fetchAllPages, getErrorMessage } from '../api/client';
import {
  createDrink,
  getDrink,
  imageSrc,
  listDrinkCategories,
  listToppings,
  updateDrink,
  uploadDrinkImage,
  type DrinkDetail,
  type SizeInput,
} from '../api/drinks';
import { listIngredients } from '../api/inventory';
import RecipeFields, { toRecipeInput, type RecipeFormLine } from './RecipeFields';

type SizeForm = { id?: number; name?: string; price?: number; isDefault?: boolean; recipe?: RecipeFormLine[] };
type FormValues = {
  name: string;
  categoryId?: number | null;
  description?: string;
  sizes: SizeForm[];
  toppingIds: number[];
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const toSizeInput = (sizes: SizeForm[]): SizeInput[] =>
  sizes.map((s, i) => ({
    ...(s.id ? { id: s.id } : {}),
    name: (s.name ?? '').trim(),
    price: s.price!,
    sortOrder: i,
    isDefault: !!s.isDefault,
    recipe: toRecipeInput(s.recipe),
  }));

const detailSizes = (d: DrinkDetail): SizeForm[] =>
  d.sizes.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    isDefault: s.isDefault,
    recipe: (s.recipe ?? []).map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })),
  }));

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

interface Props {
  open: boolean;
  /** Có id thì sửa món, không có thì thêm mới. */
  drinkId?: number;
  readOnly?: boolean;
  showCost?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function DrinkModal({ open, drinkId, readOnly, showCost, onClose, onSaved }: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const editing = drinkId != null;
  const sizes = Form.useWatch('sizes', form) as SizeForm[] | undefined;

  const { data: detail, isFetching } = useQuery({
    queryKey: ['drinks', 'detail', drinkId],
    queryFn: () => getDrink(drinkId!),
    enabled: open && editing,
  });
  const { data: categories } = useQuery({ queryKey: ['drink-categories'], queryFn: listDrinkCategories, enabled: open });
  const { data: toppings } = useQuery({ queryKey: ['toppings', { q: '' }], queryFn: () => listToppings(), enabled: open });
  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', 'list', { isActive: true, all: true }],
    queryFn: () => fetchAllPages((page) => listIngredients({ isActive: true, page, pageSize: 100 })),
    enabled: open && !readOnly,
  });

  useEffect(() => {
    if (!open) return;
    setFile(null);
    if (!editing) {
      form.resetFields();
      form.setFieldsValue({ sizes: [{ name: 'Tiêu chuẩn', isDefault: true, recipe: [{}] }], toppingIds: [] });
      setPreview(undefined);
    } else if (detail) {
      form.setFieldsValue({
        name: detail.name,
        categoryId: detail.categoryId,
        description: detail.description ?? '',
        sizes: detailSizes(detail),
        toppingIds: detail.toppings.map((t) => t.id),
      });
      setPreview(imageSrc(detail.imageUrl));
    }
  }, [open, editing, detail, form]);

  // Giải phóng URL xem trước của file vừa chọn.
  useEffect(() => () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  // Nguyên liệu đã ngừng dùng nhưng còn trong công thức của món (PB-04).
  const inactive = [
    ...new Map(
      (detail?.sizes ?? [])
        .flatMap((s) => s.recipe ?? [])
        .filter((r) => !r.isActive)
        .map((r) => [r.ingredientId, { id: r.ingredientId, name: r.name, unit: r.unit }]),
    ).values(),
  ];

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const sizeInput = toSizeInput(v.sizes);
      const toppingIds = v.toppingIds ?? [];
      const info = { name: v.name.trim(), categoryId: v.categoryId ?? null, description: v.description?.trim() || null };
      let id = drinkId;
      if (id == null) {
        id = (await createDrink({ ...info, sizes: sizeInput, toppingIds })).id;
      } else {
        // Một lần gọi, BE lưu trong một giao dịch (PB-01). Size/topping không đổi thì không gửi,
        // để sửa tên vẫn lưu được khi công thức còn nguyên liệu đã ngừng dùng (PB-04).
        const sizesChanged = !detail || JSON.stringify(sizeInput) !== JSON.stringify(toSizeInput(detailSizes(detail)));
        const toppingsChanged = !detail || !sameIds(toppingIds, detail.toppings.map((t) => t.id));
        await updateDrink(id, {
          ...info,
          ...(sizesChanged ? { sizes: sizeInput } : {}),
          ...(toppingsChanged ? { toppingIds } : {}),
        });
      }
      // Món đã lưu xong; ảnh lỗi chỉ cảnh báo để không tạo trùng món khi bấm Lưu lại.
      if (file) {
        try {
          await uploadDrinkImage(id, file);
        } catch (e) {
          return `Đã lưu đồ uống nhưng chưa tải được ảnh: ${getErrorMessage(e)}`;
        }
      }
      return null;
    },
    onSuccess: (imageError) => {
      if (imageError) message.warning(imageError);
      else message.success(editing ? 'Đã lưu đồ uống' : 'Đã thêm đồ uống');
      onSaved();
      onClose();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const onFinish = (v: FormValues) => {
    if (v.sizes.filter((s) => s.isDefault).length !== 1) {
      message.error('Phải chọn đúng một size mặc định');
      return;
    }
    save.mutate(v);
  };

  const setDefault = (index: number) =>
    form.setFieldValue(
      'sizes',
      (form.getFieldValue('sizes') as SizeForm[]).map((s, i) => ({ ...s, isDefault: i === index })),
    );

  const copyRecipe = (to: number, from: number) => {
    const all = form.getFieldValue('sizes') as SizeForm[];
    form.setFieldValue(
      'sizes',
      all.map((s, i) => (i === to ? { ...s, recipe: (all[from].recipe ?? []).map((r) => ({ ...r })) } : s)),
    );
  };

  const infoTab = (
    <Flex gap={16} align="start">
      <div style={{ width: 180 }}>
        {preview ? (
          <Image src={preview} width={180} height={180} style={{ objectFit: 'cover', borderRadius: 8 }} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ảnh" />
        )}
        {!readOnly && (
          <Upload
            accept={IMAGE_TYPES.join(',')}
            showUploadList={false}
            beforeUpload={(f) => {
              if (!IMAGE_TYPES.includes(f.type)) message.error('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
              else if (f.size > 2 * 1024 * 1024) message.error('Ảnh tối đa 2 MB');
              else {
                setFile(f);
                setPreview(URL.createObjectURL(f));
              }
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} style={{ marginTop: 8, width: 180 }}>
              {preview ? 'Đổi ảnh' : 'Chọn ảnh'}
            </Button>
          </Upload>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <Form.Item label="Tên đồ uống" name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên đồ uống' }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item label="Danh mục" name="categoryId">
          <Select allowClear placeholder="Chưa phân loại" options={categories?.map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item label="Mô tả" name="description">
          <Input.TextArea maxLength={500} rows={3} />
        </Form.Item>
      </div>
    </Flex>
  );

  const sizesTab = (
    <Form.List name="sizes">
      {(fields, { add, remove, move }) => (
        <Flex vertical gap={12}>
          {fields.map((f) => {
            const others = (sizes ?? []).map((s, i) => ({ s, i })).filter(({ i }) => i !== f.name);
            return (
              <Card key={f.key} size="small" styles={{ body: { paddingTop: 12 } }}>
                <Form.Item name={[f.name, 'id']} hidden>
                  <InputNumber />
                </Form.Item>
                <Flex gap={8} align="baseline" wrap>
                  <Form.Item
                    name={[f.name, 'name']}
                    rules={[{ required: true, whitespace: true, message: 'Nhập tên size' }]}
                    style={{ marginBottom: 0, width: 140 }}
                  >
                    <Input maxLength={20} placeholder="Tên size (S, M, L)" />
                  </Form.Item>
                  <Form.Item name={[f.name, 'price']} rules={[{ required: true, message: 'Nhập giá' }]} style={{ marginBottom: 0 }}>
                    <InputNumber min={0} max={10_000_000} step={1000} precision={0} suffix="₫" placeholder="Giá" style={{ width: 150 }} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'isDefault']} valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox onChange={(e) => e.target.checked && setDefault(f.name)}>Mặc định</Checkbox>
                  </Form.Item>
                  {!readOnly && others.length > 0 && (
                    <Select
                      size="small"
                      placeholder="Sao chép công thức từ…"
                      value={null}
                      style={{ width: 200 }}
                      options={others.map(({ s, i }) => ({ value: i, label: `Size ${s?.name || i + 1}` }))}
                      onChange={(from: number) => copyRecipe(f.name, from)}
                    />
                  )}
                  {!readOnly && fields.length > 1 && (
                    <>
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowUpOutlined />}
                        disabled={f.name === 0}
                        onClick={() => move(f.name, f.name - 1)}
                        aria-label="Đưa size lên"
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowDownOutlined />}
                        disabled={f.name === fields.length - 1}
                        onClick={() => move(f.name, f.name + 1)}
                        aria-label="Đưa size xuống"
                      />
                    </>
                  )}
                  {!readOnly && fields.length > 1 && (
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => remove(f.name)}>
                      Xóa size
                    </Button>
                  )}
                </Flex>
                {!readOnly && (
                  <RecipeFields
                    name={[f.name, 'recipe']}
                    fullPath={['sizes', f.name, 'recipe']}
                    ingredients={ingredients}
                    inactive={inactive}
                    max={30}
                    showCost={showCost}
                    price={sizes?.[f.name]?.price}
                  />
                )}
                {readOnly && (
                  <Typography.Text type="secondary">
                    {detail?.sizes[f.name]?.recipe.map((r) => `${r.name} ${r.quantity} ${r.unit}`).join(', ')}
                  </Typography.Text>
                )}
              </Card>
            );
          })}
          {!readOnly && fields.length < 5 && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ isDefault: false, recipe: [{}] })}>
              Thêm size
            </Button>
          )}
        </Flex>
      )}
    </Form.List>
  );

  const toppingsTab = (
    <Form.Item name="toppingIds" label="Topping khách được chọn thêm cho món này">
      <Checkbox.Group
        options={toppings?.map((t) => ({ value: t.id, label: `${t.name}${t.isAvailable ? '' : ' (tạm ngưng)'}` }))}
      />
    </Form.Item>
  );

  return (
    <Modal
      title={readOnly ? detail?.name : editing ? 'Sửa đồ uống' : 'Thêm đồ uống'}
      open={open}
      okText="Lưu"
      cancelText={readOnly ? 'Đóng' : 'Hủy'}
      okButtonProps={{ style: readOnly ? { display: 'none' } : undefined }}
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Spin spinning={isFetching}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          disabled={readOnly}
          onFinish={onFinish}
          onFinishFailed={() => message.error('Vui lòng kiểm tra lại thông tin ở các tab')}
        >
          <Tabs
            items={[
              { key: 'info', label: 'Thông tin', children: infoTab, forceRender: true },
              { key: 'sizes', label: 'Size và công thức', children: sizesTab, forceRender: true },
              { key: 'toppings', label: 'Topping', children: toppingsTab, forceRender: true },
            ]}
          />
        </Form>
      </Spin>
    </Modal>
  );
}
