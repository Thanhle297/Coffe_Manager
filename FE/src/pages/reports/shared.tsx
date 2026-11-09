import { Button, Segmented } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { groupByLabel, type GroupBy } from '../../api/reports';
import { colors } from '../../theme';
import { fmtMoney } from '../../utils/format';

export const PALETTE = [colors.brown, colors.caramel, colors.espresso, '#C9A27E', colors.up, colors.muted, '#8C6A52', colors.latte];

/** Trục tiền rút gọn: 1,2tr / 350k. */
export const shortMoney = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`
    : Math.abs(n) >= 1_000
      ? `${Math.round(n / 1_000)}k`
      : String(n);

export const moneyTooltip = (v: unknown) => fmtMoney(Number(v));

export const pct = (n: number) => `${(n * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

export function GroupByPicker({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <Segmented<GroupBy>
      value={value}
      onChange={onChange}
      options={(Object.keys(groupByLabel) as GroupBy[]).map((k) => ({ value: k, label: groupByLabel[k] }))}
    />
  );
}

export function CsvButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="small" icon={<DownloadOutlined />} onClick={onClick} disabled={disabled}>
      Xuất CSV
    </Button>
  );
}
