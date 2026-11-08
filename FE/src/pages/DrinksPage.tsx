import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Col,
  Flex,
  Input,
  InputNumber,
  Pagination,
  Popconfirm,
  Row,
  Select,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { CoffeeOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  deleteDrink,
  fmtPriceRange,
  imageSrc,
  listDrinkCategories,
  listDrinks,
  setDrinkAvailability,
  type Drink,
  type DrinkListParams,
} from '../api/drinks';
import { useAuth } from '../auth/useAuth';
import DrinkModal from '../components/DrinkModal';
import EmptyHint from '../components/EmptyHint';
import { colors } from '../theme';

const PAGE_SIZE = 12;

export default function DrinksPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>('all');
  const [q, setQ] = useState('');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<'all' | 'on' | 'off'>('all');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ id?: number } | null>(null);

  const params: DrinkListParams = {
    q: q || undefined,
    categoryId: category === 'all' ? undefined : category === 'none' ? 'none' : Number(category),
    isAvailable: status === 'all' ? undefined : status === 'on',
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const filtered = !!(q || minPrice != null || maxPrice != null || status !== 'all' || category !== 'all');

  const { data, isLoading } = useQuery({
    queryKey: ['drinks', 'list', params],
    queryFn: () => listDrinks(params),
    placeholderData: keepPreviousData,
  });
  const { data: categories } = useQuery({ queryKey: ['drink-categories'], queryFn: listDrinkCategories });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['drinks'] });
    queryClient.invalidateQueries({ queryKey: ['drink-categories'] });
    queryClient.invalidateQueries({ queryKey: ['toppings'] });
  };
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => setDrinkAvailability(id, on),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: deleteDrink,
    onSuccess: () => {
      message.success('Đã xóa đồ uống');
      refresh();
    },
    onError,
  });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const renderCard = (d: Drink) => {
    const src = imageSrc(d.imageUrl);
    return (
      <Card
        hoverable
        size="small"
        onClick={() => setModal({ id: d.id })}
        cover={
          src ? (
            <img alt={d.name} src={src} style={{ height: 160, objectFit: 'cover' }} />
          ) : (
            <Flex align="center" justify="center" style={{ height: 160, background: colors.foam }}>
              <CoffeeOutlined style={{ fontSize: 48, color: colors.caramel }} />
            </Flex>
          )
        }
        actions={
          isManager
            ? [
                <span key="sw" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    size="small"
                    checked={d.isAvailable}
                    loading={toggle.isPending && toggle.variables?.id === d.id}
                    onChange={(on) => toggle.mutate({ id: d.id, on })}
                  />{' '}
                  Bán
                </span>,
                <span key="del" onClick={(e) => e.stopPropagation()}>
                  <Popconfirm
                    title="Xóa đồ uống này?"
                    okText="Xóa"
                    okButtonProps={{ danger: true }}
                    cancelText="Hủy"
                    onConfirm={() => remove.mutate(d.id)}
                  >
                    <Typography.Link type="danger">Xóa</Typography.Link>
                  </Popconfirm>
                </span>,
              ]
            : undefined
        }
      >
        <Typography.Text strong ellipsis style={{ display: 'block' }}>
          {d.name}
        </Typography.Text>
        <Typography.Text type="secondary">{fmtPriceRange(d.minPrice, d.maxPrice)}</Typography.Text>
        <Flex wrap gap={4} style={{ marginTop: 6, minHeight: 22 }}>
          {!d.isAvailable && <Tag>Tạm ngưng</Tag>}
          {d.missingRecipe && <Tag color="red">Chưa có công thức</Tag>}
          {d.shortage && <Tag color="orange">Thiếu nguyên liệu</Tag>}
          {d.hasInactiveIngredient && <Tag color="volcano">Nguyên liệu ngừng dùng</Tag>}
        </Flex>
      </Card>
    );
  };

  return (
    <Card
      title="Đồ uống"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({})}>
            Thêm đồ uống
          </Button>
        )
      }
    >
      <Tabs
        activeKey={category}
        onChange={resetPage(setCategory)}
        items={[
          { key: 'all', label: 'Tất cả' },
          ...(categories ?? []).map((c) => ({ key: String(c.id), label: c.name })),
          { key: 'none', label: 'Chưa phân loại' },
        ]}
      />
      <Flex gap={8} wrap style={{ marginBottom: 16 }}>
        <Input.Search allowClear placeholder="Tìm theo tên" onSearch={resetPage(setQ)} style={{ width: 220 }} />
        <InputNumber
          placeholder="Giá từ"
          min={0}
          step={1000}
          value={minPrice}
          onChange={resetPage(setMinPrice)}
          style={{ width: 130 }}
        />
        <InputNumber
          placeholder="Giá đến"
          min={0}
          step={1000}
          value={maxPrice}
          onChange={resetPage(setMaxPrice)}
          style={{ width: 130 }}
        />
        <Select
          value={status}
          onChange={resetPage(setStatus)}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: 'Mọi tình trạng' },
            { value: 'on', label: 'Đang bán' },
            { value: 'off', label: 'Tạm ngưng' },
          ]}
        />
      </Flex>

      <Spin spinning={isLoading}>
        {data && data.items.length === 0 ? (
          <EmptyHint filtered={filtered} noun="đồ uống" actionLabel="Thêm đồ uống" onAction={isManager ? () => setModal({}) : undefined} />
        ) : (
          <Row gutter={[16, 16]}>
            {data?.items.map((d) => (
              <Col key={d.id} xs={24} sm={12} md={8} lg={6} xl={4}>
                {renderCard(d)}
              </Col>
            ))}
          </Row>
        )}
      </Spin>
      {data && data.total > PAGE_SIZE && (
        <Flex justify="end" style={{ marginTop: 16 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} showSizeChanger={false} />
        </Flex>
      )}

      <DrinkModal
        open={modal !== null}
        drinkId={modal?.id}
        readOnly={!isManager}
        showCost={isManager}
        onClose={() => setModal(null)}
        onSaved={refresh}
      />
    </Card>
  );
}
