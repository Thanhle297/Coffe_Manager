import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Flex, Row, Spin, Statistic, Table, Typography } from 'antd';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getRevenueReport, methodLabel, type GroupBy, type Range, type RevenueReport } from '../../api/reports';
import { colors } from '../../theme';
import { downloadCsv } from '../../utils/csv';
import { fmtMoney } from '../../utils/format';
import { CsvButton, GroupByPicker, moneyTooltip, PALETTE, shortMoney } from './shared';

type Row = RevenueReport['series'][number];

export default function RevenueTab({ range }: { range: Range }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'revenue', range, groupBy],
    queryFn: () => getRevenueReport(range, groupBy),
  });

  if (isLoading || !data) return <Spin style={{ display: 'block', margin: 48 }} />;
  const s = data.summary;
  const methods = data.byMethod.map((m) => ({ name: methodLabel[m.method ?? ''] ?? 'Khác', value: m.total, orders: m.orders }));

  const exportCsv = () =>
    downloadCsv<Row>(`doanh-thu_${range.from}_${range.to}`, [
      { title: 'Kỳ', value: (r) => r.label },
      { title: 'Số đơn', value: (r) => r.orders },
      { title: 'Tiền hàng', value: (r) => r.subtotal },
      { title: 'Giảm giá + đổi điểm', value: (r) => r.discount },
      { title: 'Doanh thu', value: (r) => r.total },
    ], data.series);

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Doanh thu" value={fmtMoney(s.total)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Số đơn" value={s.orders} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Trung bình / đơn" value={fmtMoney(s.avgOrder)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Giảm giá + đổi điểm" value={fmtMoney(s.discount)} /></Card></Col>
      </Row>

      <Card size="small" title="Doanh thu theo thời gian" extra={<GroupByPicker value={groupBy} onChange={setGroupBy} />}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis tickFormatter={shortMoney} fontSize={12} />
            <Tooltip formatter={moneyTooltip} />
            <Bar dataKey="total" name="Doanh thu" fill={colors.brown} radius={[6, 6, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <Card size="small" title="Theo phương thức thanh toán">
            {methods.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={methods} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {methods.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={moneyTooltip} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card size="small" title="Theo danh mục đồ uống">
            <Table
              size="small"
              rowKey={(r) => r.categoryId ?? 0}
              pagination={false}
              dataSource={data.byCategory}
              columns={[
                { title: 'Danh mục', dataIndex: 'name' },
                { title: 'Số ly', dataIndex: 'quantity', align: 'right', width: 90 },
                { title: 'Tiền hàng', dataIndex: 'revenue', align: 'right', width: 150, render: fmtMoney },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Tính theo giá bán từng dòng (gồm topping), trước giảm giá và đổi điểm của cả đơn.
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Chi tiết theo kỳ" extra={<CsvButton onClick={exportCsv} />}>
        <Table
          size="small"
          rowKey="period"
          dataSource={data.series}
          pagination={{ pageSize: 31, hideOnSinglePage: true }}
          columns={[
            { title: 'Kỳ', dataIndex: 'label' },
            { title: 'Số đơn', dataIndex: 'orders', align: 'right' },
            { title: 'Tiền hàng', dataIndex: 'subtotal', align: 'right', render: fmtMoney },
            { title: 'Giảm giá + đổi điểm', dataIndex: 'discount', align: 'right', render: fmtMoney },
            { title: 'Doanh thu', dataIndex: 'total', align: 'right', render: (v: number) => <strong>{fmtMoney(v)}</strong> },
          ]}
        />
      </Card>
    </Flex>
  );
}
