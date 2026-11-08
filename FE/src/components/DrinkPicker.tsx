import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Flex, Input, Row, Spin, Tabs, Tag, Typography } from 'antd';
import { CoffeeOutlined } from '@ant-design/icons';
import { fmtK, getMenu, imageSrc, type MenuDrink } from '../api/drinks';
import { colors } from '../theme';

interface Props {
  onPick: (drink: MenuDrink) => void;
}

/** Lưới món đang bán theo danh mục, có tìm kiếm; dùng ở màn hình gọi món. */
export default function DrinkPicker({ onPick }: Props) {
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['drinks', 'menu'], queryFn: getMenu });

  const keyword = q.trim().toLowerCase();
  const drinks = (data?.drinks ?? []).filter(
    (d) =>
      (category === 'all' || String(d.categoryId ?? 'none') === category) &&
      (!keyword || d.name.toLowerCase().includes(keyword)),
  );
  const hasUncategorized = data?.drinks.some((d) => d.categoryId == null);

  return (
    <Flex vertical gap={8}>
      <Input.Search allowClear placeholder="Tìm món" value={q} onChange={(e) => setQ(e.target.value)} />
      <Tabs
        size="small"
        activeKey={category}
        onChange={setCategory}
        items={[
          { key: 'all', label: 'Tất cả' },
          ...(data?.categories ?? []).map((c) => ({ key: String(c.id), label: c.name })),
          ...(hasUncategorized ? [{ key: 'none', label: 'Chưa phân loại' }] : []),
        ]}
      />
      <Spin spinning={isLoading}>
        {drinks.length === 0 ? (
          <Empty description="Không có món phù hợp" />
        ) : (
          <Row gutter={[12, 12]}>
            {drinks.map((d) => {
              const src = imageSrc(d.imageUrl);
              const price = d.sizes.find((s) => s.isDefault)?.price ?? d.sizes[0]?.price;
              return (
                <Col key={d.id} xs={12} sm={8} md={6} xl={4}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => onPick(d)}
                    cover={
                      src ? (
                        <img alt={d.name} src={src} style={{ height: 100, objectFit: 'cover' }} />
                      ) : (
                        <Flex align="center" justify="center" style={{ height: 100, background: colors.foam }}>
                          <CoffeeOutlined style={{ fontSize: 32, color: colors.caramel }} />
                        </Flex>
                      )
                    }
                  >
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {d.name}
                    </Typography.Text>
                    <Flex justify="space-between" align="center">
                      <Typography.Text type="secondary">{price != null ? fmtK(price) : '—'}</Typography.Text>
                      {d.shortage && <Tag color="orange" style={{ marginInlineEnd: 0 }}>Thiếu NL</Tag>}
                    </Flex>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>
    </Flex>
  );
}
