import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Flex, Row, Spin, Statistic, Table } from 'antd';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDrinksSoldReport, type DrinkSoldRow, type Range } from '../../api/reports';
import { colors } from '../../theme';
import { downloadCsv } from '../../utils/csv';
import { fmtMoney } from '../../utils/format';
import { CsvButton } from './shared';

export default function DrinksTab({ range }: { range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'drinks-sold', range],
    queryFn: () => getDrinksSoldReport(range),
  });

  if (isLoading || !data) return <Spin style={{ display: 'block', margin: 48 }} />;

  // Top 10 theo đồ uống (gộp các size).
  const byDrink = new Map<number, { name: string; quantity: number }>();
  for (const i of data.items) {
    const d = byDrink.get(i.drinkId) ?? { name: i.drinkName, quantity: 0 };
    d.quantity += i.quantity;
    byDrink.set(i.drinkId, d);
  }
  const top = [...byDrink.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  const exportCsv = () =>
    downloadCsv<DrinkSoldRow>(`do-uong-ban_${range.from}_${range.to}`, [
      { title: 'Đồ uống', value: (r) => r.drinkName },
      { title: 'Size', value: (r) => r.sizeName },
      { title: 'Danh mục', value: (r) => r.category },
      { title: 'Số ly', value: (r) => r.quantity },
      { title: 'Tiền hàng', value: (r) => r.revenue },
      { title: 'Giá vốn', value: (r) => r.cost },
      { title: 'Lãi gộp', value: (r) => r.profit },
    ], data.items);

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng số ly" value={data.totalQuantity} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tiền hàng" value={fmtMoney(data.totalRevenue)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Số món" value={byDrink.size} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Topping đã bán" value={data.toppings.reduce((s, t) => s + t.quantity, 0)} /></Card>
        </Col>
      </Row>

      <Card size="small" title="Top 10 đồ uống bán chạy">
        {top.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, top.length * 36)}>
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="name" width={140} fontSize={12} />
              <Tooltip />
              <Bar dataKey="quantity" name="Số ly" fill={colors.caramel} radius={[0, 6, 6, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card size="small" title="Chi tiết theo đồ uống và size" extra={<CsvButton onClick={exportCsv} disabled={!data.items.length} />}>
        <Table
          size="small"
          rowKey={(r) => r.sizeId}
          dataSource={data.items}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          columns={[
            { title: 'Đồ uống', dataIndex: 'drinkName', sorter: (a, b) => a.drinkName.localeCompare(b.drinkName) },
            { title: 'Size', dataIndex: 'sizeName', width: 80 },
            {
              title: 'Danh mục',
              dataIndex: 'category',
              filters: [...new Set(data.items.map((i) => i.category))].map((c) => ({ text: c, value: c })),
              onFilter: (v, r) => r.category === v,
            },
            { title: 'Số ly', dataIndex: 'quantity', align: 'right', sorter: (a, b) => a.quantity - b.quantity, defaultSortOrder: 'descend' },
            { title: 'Tiền hàng', dataIndex: 'revenue', align: 'right', render: fmtMoney, sorter: (a, b) => a.revenue - b.revenue },
            { title: 'Giá vốn', dataIndex: 'cost', align: 'right', render: fmtMoney },
            { title: 'Lãi gộp', dataIndex: 'profit', align: 'right', render: fmtMoney, sorter: (a, b) => a.profit - b.profit },
          ]}
        />
      </Card>

      <Card size="small" title="Topping">
        <Table
          size="small"
          rowKey="toppingId"
          dataSource={data.toppings}
          pagination={false}
          columns={[
            { title: 'Topping', dataIndex: 'name' },
            { title: 'Số phần', dataIndex: 'quantity', align: 'right' },
            { title: 'Tiền topping', dataIndex: 'revenue', align: 'right', render: fmtMoney },
            { title: 'Giá vốn', dataIndex: 'cost', align: 'right', render: fmtMoney },
          ]}
        />
      </Card>
    </Flex>
  );
}
