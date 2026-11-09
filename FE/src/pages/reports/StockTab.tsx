import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Flex, Row, Segmented, Spin, Statistic, Table, Tag, Tooltip } from 'antd';
import {
  getStockLevelReport,
  getStockMovementReport,
  inSourceLabel,
  outReasonLabel,
  type Range,
  type StockLevelRow,
  type StockMovementRow,
} from '../../api/reports';
import { downloadCsv } from '../../utils/csv';
import { fmtDateTime, fmtMoney, fmtNum } from '../../utils/format';
import { CsvButton } from './shared';

const breakdown = (by: Record<string, number>, labels: Record<string, string>) =>
  Object.entries(by)
    .map(([k, v]) => `${labels[k] ?? k}: ${fmtNum(v)}`)
    .join('\n');

const qtyWithTip = (qty: number, by: Record<string, number>, labels: Record<string, string>) =>
  qty ? (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{breakdown(by, labels)}</span>}>
      <span style={{ borderBottom: '1px dotted' }}>{fmtNum(qty)}</span>
    </Tooltip>
  ) : (
    fmtNum(0)
  );

function MovementView({ range }: { range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'stock-movement', range],
    queryFn: () => getStockMovementReport(range),
  });
  if (isLoading || !data) return <Spin style={{ display: 'block', margin: 48 }} />;

  const exportCsv = () =>
    downloadCsv<StockMovementRow>(`xuat-nhap-ton_${range.from}_${range.to}`, [
      { title: 'Nguyên liệu', value: (r) => r.name },
      { title: 'Đơn vị', value: (r) => r.unit },
      { title: 'Loại', value: (r) => r.category },
      { title: 'Tồn đầu', value: (r) => r.opening },
      { title: 'Nhập', value: (r) => r.inQty },
      ...Object.keys(inSourceLabel).map((k) => ({ title: `Nhập - ${inSourceLabel[k]}`, value: (r: StockMovementRow) => r.inBySource[k] ?? 0 })),
      { title: 'Giá trị nhập', value: (r) => r.inValue },
      { title: 'Xuất', value: (r) => r.outQty },
      ...Object.keys(outReasonLabel).map((k) => ({ title: `Xuất - ${outReasonLabel[k]}`, value: (r: StockMovementRow) => r.outByReason[k] ?? 0 })),
      { title: 'Giá trị xuất', value: (r) => r.outValue },
      { title: 'Tồn cuối', value: (r) => r.closing },
    ], data.items);

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Giá trị nhập" value={fmtMoney(data.totalInValue)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Giá trị xuất" value={fmtMoney(data.totalOutValue)} /></Card></Col>
      </Row>
      <Card size="small" title="Xuất nhập tồn" extra={<CsvButton onClick={exportCsv} disabled={!data.items.length} />}>
        <Table
          size="small"
          rowKey="ingredientId"
          dataSource={data.items}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Nguyên liệu', dataIndex: 'name', fixed: 'left', sorter: (a, b) => a.name.localeCompare(b.name) },
            { title: 'ĐV', dataIndex: 'unit', width: 60 },
            { title: 'Tồn đầu', dataIndex: 'opening', align: 'right', render: fmtNum },
            { title: 'Nhập', align: 'right', render: (_, r) => qtyWithTip(r.inQty, r.inBySource, inSourceLabel) },
            { title: 'Giá trị nhập', dataIndex: 'inValue', align: 'right', render: fmtMoney },
            { title: 'Xuất', align: 'right', render: (_, r) => qtyWithTip(r.outQty, r.outByReason, outReasonLabel) },
            { title: 'Giá trị xuất', dataIndex: 'outValue', align: 'right', render: fmtMoney },
            { title: 'Tồn cuối', dataIndex: 'closing', align: 'right', render: (v: number) => <strong>{fmtNum(v)}</strong> },
          ]}
        />
      </Card>
    </Flex>
  );
}

function LevelView() {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'stock-level'], queryFn: getStockLevelReport });
  if (isLoading || !data) return <Spin style={{ display: 'block', margin: 48 }} />;

  const exportCsv = () =>
    downloadCsv<StockLevelRow>('ton-kho', [
      { title: 'Nguyên liệu', value: (r) => r.name },
      { title: 'Đơn vị', value: (r) => r.unit },
      { title: 'Loại', value: (r) => r.category },
      { title: 'Tồn', value: (r) => r.quantity },
      { title: 'Tối thiểu', value: (r) => r.minStock },
      { title: 'Giá vốn BQ', value: (r) => r.avgCost },
      { title: 'Giá trị', value: (r) => r.value },
    ], data.items);

  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Giá trị tồn kho" value={fmtMoney(data.summary.totalValue)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Số nguyên liệu" value={data.summary.ingredientCount} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Dưới mức tối thiểu" value={data.summary.lowCount} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Lô sắp / đã hết hạn" value={data.expiringLots.length} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card size="small" title="Tồn kho hiện tại" extra={<CsvButton onClick={exportCsv} disabled={!data.items.length} />}>
            <Table
              size="small"
              rowKey="ingredientId"
              dataSource={data.items}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              columns={[
                {
                  title: 'Nguyên liệu',
                  dataIndex: 'name',
                  render: (v: string, r) => (
                    <span>
                      {v} {r.isLow && <Tag color="orange">Dưới tối thiểu</Tag>}
                    </span>
                  ),
                },
                { title: 'Tồn', align: 'right', render: (_, r) => `${fmtNum(r.quantity)} ${r.unit}` },
                { title: 'Tối thiểu', dataIndex: 'minStock', align: 'right', render: fmtNum },
                { title: 'Giá trị', dataIndex: 'value', align: 'right', render: fmtMoney, sorter: (a, b) => a.value - b.value },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Flex vertical gap={16}>
            <Card size="small" title="Giá trị theo loại">
              <Table
                size="small"
                rowKey="name"
                pagination={false}
                dataSource={data.byCategory}
                columns={[
                  { title: 'Loại', dataIndex: 'name' },
                  { title: 'Giá trị', dataIndex: 'value', align: 'right', render: fmtMoney },
                ]}
              />
            </Card>
            <Card size="small" title="Lô sắp hết hạn (3 ngày)">
              <Table
                size="small"
                rowKey="lotId"
                pagination={false}
                dataSource={data.expiringLots}
                columns={[
                  { title: 'Nguyên liệu', dataIndex: 'name' },
                  { title: 'Còn', align: 'right', render: (_, r) => `${fmtNum(r.remainingQty)} ${r.unit}` },
                  {
                    title: 'Hạn',
                    render: (_, r) => <Tag color={r.expired ? 'error' : 'warning'}>{fmtDateTime(r.expiresAt)}</Tag>,
                  },
                ]}
              />
            </Card>
          </Flex>
        </Col>
      </Row>
    </Flex>
  );
}

export default function StockTab({ range }: { range: Range }) {
  const [view, setView] = useState<'movement' | 'level'>('movement');
  return (
    <Flex vertical gap={16}>
      <Segmented
        value={view}
        onChange={(v) => setView(v as 'movement' | 'level')}
        options={[
          { value: 'movement', label: 'Xuất nhập tồn (theo kỳ)' },
          { value: 'level', label: 'Tồn hiện tại' },
        ]}
        style={{ alignSelf: 'flex-start' }}
      />
      {view === 'movement' ? <MovementView range={range} /> : <LevelView />}
    </Flex>
  );
}
