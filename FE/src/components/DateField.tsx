import { DatePicker } from 'antd';
import dayjs from 'dayjs';

interface Props {
  /** Giá trị dạng YYYY-MM-DD (giữ nguyên định dạng API), hiển thị DD/MM/YYYY. */
  value?: string | null;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  title?: string;
}

export default function DateField({ value, onChange, min, max, placeholder = 'dd/mm/yyyy', style, title }: Props) {
  return (
    <DatePicker
      format="DD/MM/YYYY"
      placeholder={placeholder}
      title={title}
      style={{ width: '100%', ...style }}
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange?.(d ? d.format('YYYY-MM-DD') : '')}
      disabledDate={(d) =>
        Boolean((min && d.isBefore(dayjs(min), 'day')) || (max && d.isAfter(dayjs(max), 'day')))
      }
    />
  );
}
