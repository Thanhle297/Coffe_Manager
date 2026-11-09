import { useState } from 'react';
import { Card, DatePicker, Tabs } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Range } from '../api/reports';
import DrinksTab from './reports/DrinksTab';
import ProfitTab from './reports/ProfitTab';
import RevenueTab from './reports/RevenueTab';
import StockTab from './reports/StockTab';

const presets: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: 'Hôm nay', value: [dayjs(), dayjs()] },
  { label: '7 ngày qua', value: [dayjs().subtract(6, 'day'), dayjs()] },
  { label: '30 ngày qua', value: [dayjs().subtract(29, 'day'), dayjs()] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] },
  { label: 'Tháng trước', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { label: 'Quý này', value: [dayjs().month(Math.floor(dayjs().month() / 3) * 3).startOf('month'), dayjs()] },
  { label: 'Năm nay', value: [dayjs().startOf('year'), dayjs()] },
];

/** Báo cáo và thống kê (chỉ Quản lý): doanh thu, đồ uống, lợi nhuận, kho. */
export default function ReportsPage() {
  const [dates, setDates] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [tab, setTab] = useState('revenue');
  const range: Range = { from: dates[0].format('YYYY-MM-DD'), to: dates[1].format('YYYY-MM-DD') };

  return (
    <Card
      title="Báo cáo"
      extra={
        <DatePicker.RangePicker
          allowClear={false}
          format="DD/MM/YYYY"
          value={dates}
          presets={presets}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          onChange={(v) => v?.[0] && v[1] && setDates([v[0], v[1]])}
        />
      }
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          { key: 'revenue', label: 'Doanh thu', children: <RevenueTab range={range} /> },
          { key: 'drinks', label: 'Đồ uống bán', children: <DrinksTab range={range} /> },
          { key: 'profit', label: 'Lợi nhuận', children: <ProfitTab range={range} /> },
          { key: 'stock', label: 'Kho', children: <StockTab range={range} /> },
        ]}
      />
    </Card>
  );
}
