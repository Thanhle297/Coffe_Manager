import { Button, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface Props {
  /** Đang có bộ lọc/tìm kiếm: hiện thông báo "không có kết quả" thay vì lời mời tạo mới. */
  filtered?: boolean;
  /** Tên đối tượng, ví dụ "khách hàng", "phiếu nhập". */
  noun: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyHint({ filtered, noun, actionLabel, onAction }: Props) {
  if (filtered) return <Empty description={`Không tìm thấy ${noun} phù hợp. Thử đổi hoặc xóa bộ lọc.`} />;
  return (
    <Empty description={`Chưa có ${noun} nào`}>
      {onAction && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Empty>
  );
}
