import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import { EditOutlined, FireOutlined, PlusOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import {
  createPrepBatch,
  DEFAULT_INGREDIENT_ICON,
  getPrepBatch,
  getPrepRecipe,
  listIngredients,
  listPrepBatches,
  type Ingredient,
  type PrepBatch,
  type StockOutItem,
} from '../api/inventory';
import { useAuth } from '../auth/useAuth';
import PrepRecipeModal from '../components/PrepRecipeModal';
import { expiryState, fmtDateTime, fmtMoney, fmtNum, fmtRemaining, fmtUnitPrice, ymdLocal } from '../utils/format';
import { colors } from '../theme';

const expiryColor = { OK: 'green', EXPIRING: 'orange', EXPIRED: 'volcano', NONE: 'default' } as const;

function PrepCard({ ing, onDone, onEdit }: { ing: Ingredient; onDone: () => void; onEdit?: () => void }) {
  const { message } = AntdApp.useApp();
  const [batches, setBatches] = useState<number | null>(1);
  const [actualQty, setActualQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const { data: recipe } = useQuery({ queryKey: ['ingredients', 'prep-recipe', ing.id], queryFn: () => getPrepRecipe(ing.id) });

  const ready = !!ing.batchYield && !!recipe && recipe.items.length > 0;
  const expected = ing.batchYield && batches ? ing.batchYield * batches : 0;
  const state = expiryState(ing.nextExpiresAt, 'PREPARED');

  const mutation = useMutation({
    mutationFn: () =>
      createPrepBatch({
        preparedId: ing.id,
        batches: batches!,
        actualQty: actualQty ?? undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: (b) => {
      message.success(`Đã lập phiếu sơ chế ${b.code}: +${fmtNum(b.actualQty)} ${ing.unit}`);
      setActualQty(null);
      setNote('');
      onDone();
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  return (
    <Card
      size="small"
      title={
        <span>
          <span style={{ marginInlineEnd: 8 }}>{ing.category?.icon ?? DEFAULT_INGREDIENT_ICON}</span>
          {ing.name}
        </span>
      }
      extra={
        <Flex gap={8} align="center">
          {ing.shelfLifeHours && <Typography.Text type="secondary">Hạn {ing.shelfLifeHours} giờ</Typography.Text>}
          {onEdit && <Button size="small" icon={<EditOutlined />} onClick={onEdit}>Sửa công thức</Button>}
        </Flex>
      }
    >
      <Flex gap={24} style={{ marginBottom: 12 }}>
        <Statistic
          title="Tồn dùng được"
          value={fmtNum(ing.usableQty)}
          suffix={ing.unit}
          valueStyle={{ fontSize: 20, color: ing.minStock > 0 && ing.usableQty <= ing.minStock ? colors.down : undefined }}
        />
        <div>
          <Typography.Text type="secondary">Hạn gần nhất</Typography.Text>
          <div style={{ marginTop: 6 }}>
            {ing.nextExpiresAt ? (
              <Tag color={expiryColor[state]}>{fmtRemaining(ing.nextExpiresAt)}</Tag>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
          </div>
        </div>
      </Flex>

      {!ready ? (
        <Typography.Text type="warning">Chưa khai báo định mức mẻ. Quản lý bấm “Sửa công thức” để khai báo.</Typography.Text>
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            1 mẻ = {recipe!.items.map((i) => `${fmtNum(i.quantity)} ${i.ingredient.unit} ${i.ingredient.name}`).join(' + ')} →{' '}
            {fmtNum(ing.batchYield)} {ing.unit}
          </Typography.Paragraph>
          <Flex gap={8} wrap>
            <InputNumber min={0.01} step={0.5} precision={2} value={batches} onChange={setBatches} prefix="Số mẻ" style={{ width: 140 }} />
            <InputNumber
              min={0.001}
              precision={3}
              value={actualQty}
              onChange={setActualQty}
              placeholder={`Thực tế (mặc định ${fmtNum(expected)})`}
              suffix={ing.unit}
              style={{ width: 220 }}
            />
          </Flex>
          <Input
            placeholder="Ghi chú (không bắt buộc)"
            maxLength={255}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginTop: 8 }}
          />
          <Popconfirm
            title={`Làm ${fmtNum(batches ?? 0)} mẻ ${ing.name}?`}
            description={`Trừ: ${recipe!.items
              .map((i) => `${fmtNum(i.quantity * (batches ?? 0))} ${i.ingredient.unit} ${i.ingredient.name}`)
              .join(', ')}`}
            okText="Làm mẻ"
            cancelText="Hủy"
            onConfirm={() => mutation.mutate()}
            disabled={!batches}
          >
            <Button type="primary" icon={<FireOutlined />} block style={{ marginTop: 8 }} loading={mutation.isPending} disabled={!batches}>
              Làm mẻ
            </Button>
          </Popconfirm>
        </>
      )}
    </Card>
  );
}

export default function PrepPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [detailId, setDetailId] = useState<number | null>(null);
  const [recipeModal, setRecipeModal] = useState<{ open: boolean; ing?: Ingredient }>({ open: false });
  const today = ymdLocal(new Date());

  const { data: prepared, isLoading } = useQuery({
    queryKey: ['ingredients', 'list', { type: 'PREPARED', isActive: true, all: true }],
    queryFn: () => listIngredients({ type: 'PREPARED', isActive: true, page: 1, pageSize: 100 }),
  });
  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['prep-batches', { from: today, to: today }],
    queryFn: () => listPrepBatches({ from: today, to: today, page: 1, pageSize: 100 }),
  });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['prep-batches', 'detail', detailId],
    queryFn: () => getPrepBatch(detailId!),
    enabled: detailId !== null,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    queryClient.invalidateQueries({ queryKey: ['prep-batches'] });
    queryClient.invalidateQueries({ queryKey: ['stock-out'] });
  };

  const columns: TableProps<PrepBatch>['columns'] = [
    { title: 'Mã phiếu', dataIndex: 'code', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Giờ làm', dataIndex: 'producedAt', render: (v: string) => fmtDateTime(v).slice(-5) },
    { title: 'Bán thành phẩm', render: (_, b) => `${b.prepared.category?.icon ?? DEFAULT_INGREDIENT_ICON} ${b.prepared.name}` },
    { title: 'Số mẻ', dataIndex: 'batches', align: 'right', render: fmtNum },
    {
      title: 'Sản lượng',
      align: 'right',
      render: (_, b) => (
        <span>
          {fmtNum(b.actualQty)} {b.prepared.unit}
          {b.actualQty !== b.expectedQty && (
            <div style={{ fontSize: 12, color: colors.muted }}>
              định mức {fmtNum(b.expectedQty)}
            </div>
          )}
        </span>
      ),
    },
    { title: 'Chi phí', dataIndex: 'totalCost', align: 'right', render: fmtMoney },
    { title: 'Hạn', dataIndex: 'expiresAt', render: (v: string) => <span title={fmtDateTime(v)}>{fmtRemaining(v)}</span> },
    { title: 'Người làm', responsive: ['lg'], render: (_, b) => b.createdBy.fullName },
    {
      title: '',
      render: (_, b) => (
        <Button size="small" onClick={() => setDetailId(b.id)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const itemColumns: TableProps<StockOutItem>['columns'] = [
    { title: 'Nguyên liệu thô', render: (_, i) => i.ingredient.name },
    { title: 'Đã dùng', align: 'right', render: (_, i) => `${fmtNum(i.quantity)} ${i.ingredient.unit}` },
    { title: 'Giá vốn', align: 'right', render: (_, i) => `${fmtUnitPrice(i.unitCost)}/${i.ingredient.unit}` },
    { title: 'Thành tiền', align: 'right', render: (_, i) => fmtMoney(i.quantity * i.unitCost) },
  ];

  return (
    <Flex vertical gap={16}>
      <Card
        title="Sơ chế đầu ca"
        loading={isLoading}
        extra={
          isManager && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRecipeModal({ open: true })}>
              Tạo công thức sơ chế
            </Button>
          )
        }
      >
        {prepared?.items.length ? (
          <Row gutter={[16, 16]}>
            {prepared.items.map((ing) => (
              <Col key={ing.id} xs={24} md={12} xl={8}>
                <PrepCard ing={ing} onDone={refresh} onEdit={isManager ? () => setRecipeModal({ open: true, ing }) : undefined} />
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="Chưa có công thức sơ chế nào. Quản lý bấm “Tạo công thức sơ chế” để thêm." />
        )}
      </Card>

      <Card title="Phiếu sơ chế hôm nay">
        <Table<PrepBatch>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={batches?.items}
          loading={batchesLoading}
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      <PrepRecipeModal
        open={recipeModal.open}
        ing={recipeModal.ing}
        onClose={() => setRecipeModal({ open: false })}
        onSaved={refresh}
      />

      <Drawer
        title={detail ? `Phiếu sơ chế ${detail.code}` : 'Phiếu sơ chế'}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        size={720}
        loading={detailLoading}
        destroyOnHidden
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Bán thành phẩm" span={2}>{detail.prepared.name}</Descriptions.Item>
              <Descriptions.Item label="Thời gian">{fmtDateTime(detail.producedAt)}</Descriptions.Item>
              <Descriptions.Item label="Hạn">{fmtDateTime(detail.expiresAt)}</Descriptions.Item>
              <Descriptions.Item label="Số mẻ">{fmtNum(detail.batches)}</Descriptions.Item>
              <Descriptions.Item label="Người làm">{detail.createdBy.fullName}</Descriptions.Item>
              <Descriptions.Item label="Sản lượng định mức">{`${fmtNum(detail.expectedQty)} ${detail.prepared.unit}`}</Descriptions.Item>
              <Descriptions.Item label="Sản lượng thực tế">{`${fmtNum(detail.actualQty)} ${detail.prepared.unit}`}</Descriptions.Item>
              <Descriptions.Item label="Tổng chi phí">{fmtMoney(detail.totalCost)}</Descriptions.Item>
              <Descriptions.Item label="Giá vốn">
                {detail.lot ? `${fmtUnitPrice(detail.lot.unitCost)}/${detail.prepared.unit}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Phiếu xuất">{detail.stockOut?.code ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{detail.note ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Table<StockOutItem> rowKey="id" size="small" pagination={false} columns={itemColumns} dataSource={detail.stockOut?.items} />
          </>
        )}
      </Drawer>
    </Flex>
  );
}
