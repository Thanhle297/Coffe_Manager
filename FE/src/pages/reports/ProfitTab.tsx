import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Descriptions, Flex, Row, Spin, Statistic, Table, Typography } from 'antd';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getProfitReport, outReasonLabel, type GroupBy, type ProfitRow, type Range } from '../../api/reports';
import { colors } from '../../theme';
import { downloadCsv } from '../../utils/csv';
import { fmtMoney } from '../../utils/format';
import { CsvButton, GroupByPicker, moneyTooltip, pct, shortMoney } from './shared';

const signed = (v: number) => (
  <span style={{ color: v < 0 ? colors.down : undefined, fontWeight: 600 }}>{fmtMoney(v)}</span>
);

export default function ProfitTab({ range }: { range: Range }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'profit', range, groupBy],
    queryFn: () => getProfitReport(range, groupBy),
  });

  if (isLoading || !data) return <Spin style={{ display: 'block', margin: 48 }} />;
  const s = data.summary;
  const reasons = Object.entries(s.wastageByReason)
    .filter(([, v]) => v)
    .map(([k, v]) => `${outReasonLabel[k] ?? k}: ${fmtMoney(v)}`)
    .join(' · ');

  const exportCsv = () =>
    downloadCsv<ProfitRow>(`loi-nhuan_${range.from}_${range.to}`, [
      { title: 'Kỳ', value: (r) => r.label },
      { title: 'Doanh thu', value: (r) => r.revenue },
      { title: 'Giá vốn', value: (r) => r.cogs },
      { title: 'Lãi gộp', value: (r) => r.grossProfit },
      { title: 'Hao hụt / dùng nội bộ', value: (r) => r.wastage },
      { title: 'Dư kiểm kê', value: (r) => r.countSurplus },
      { title: 'Lương', value: (r) => r.payroll },
      { title: 'Lãi ròng', value: (r) => r.netProfit },
    ], data.series);

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Doanh thu" value={fmtMoney(s.revenue)} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title={`Lãi gộp (${pct(s.grossMargin)})`} value={fmtMoney(s.grossProfit)} /></Card>
        </Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Chi phí lương" value={fmtMoney(s.payroll)} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={`Lãi ròng (${pct(s.netMargin)})`}
              value={fmtMoney(s.netProfit)}
              valueStyle={{ color: s.netProfit < 0 ? colors.down : colors.up }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card size="small" title="Kết quả kinh doanh" style={{ height: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Doanh thu (sau giảm giá)">{fmtMoney(s.revenue)}</Descriptions.Item>
              <Descriptions.Item label="− Giá vốn nguyên liệu">{fmtMoney(s.cogs)}</Descriptions.Item>
              <Descriptions.Item label="= Lãi gộp">{signed(s.grossProfit)}</Descriptions.Item>
              <Descriptions.Item label="− Hao hụt / dùng nội bộ">{fmtMoney(s.wastage)}</Descriptions.Item>
              <Descriptions.Item label="+ Dư kiểm kê">{fmtMoney(s.countSurplus)}</Descriptions.Item>
              <Descriptions.Item label="− Lương nhân viên">{fmtMoney(s.payroll)}</Descriptions.Item>
              <Descriptions.Item label="= Lãi ròng">{signed(s.netProfit)}</Descriptions.Item>
            </Descriptions>
            {reasons && (
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                Hao hụt gồm {reasons}
              </Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card size="small" title="Diễn biến" extra={<GroupByPicker value={groupBy} onChange={setGroupBy} />}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis tickFormatter={shortMoney} fontSize={12} />
                <Tooltip formatter={moneyTooltip} />
                <Legend />
                <Bar dataKey="revenue" name="Doanh thu" fill={colors.latte} maxBarSize={40} />
                <Bar dataKey="cogs" name="Giá vốn" stackId="cost" fill={colors.caramel} maxBarSize={40} />
                <Bar dataKey="payroll" name="Lương" stackId="cost" fill={colors.espresso} maxBarSize={40} />
                <Bar dataKey="wastage" name="Hao hụt" stackId="cost" fill={colors.warn} maxBarSize={40} />
                <Line dataKey="netProfit" name="Lãi ròng" stroke={colors.up} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Chi tiết theo kỳ" extra={<CsvButton onClick={exportCsv} />}>
        <Table
          size="small"
          rowKey="period"
          dataSource={data.series}
          pagination={{ pageSize: 31, hideOnSinglePage: true }}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Kỳ', dataIndex: 'label', fixed: 'left' },
            { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: fmtMoney },
            { title: 'Giá vốn', dataIndex: 'cogs', align: 'right', render: fmtMoney },
            { title: 'Lãi gộp', dataIndex: 'grossProfit', align: 'right', render: signed },
            { title: 'Hao hụt', dataIndex: 'wastage', align: 'right', render: fmtMoney },
            { title: 'Dư kiểm kê', dataIndex: 'countSurplus', align: 'right', render: fmtMoney },
            { title: 'Lương', dataIndex: 'payroll', align: 'right', render: fmtMoney },
            { title: 'Lãi ròng', dataIndex: 'netProfit', align: 'right', render: signed },
          ]}
        />
      </Card>
    </Flex>
  );
}
