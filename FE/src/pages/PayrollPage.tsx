import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Modal, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { getEmployeePayroll, getPayroll, shiftTimeLabel, type Attendance, type PayrollRow } from '../api/employees';
import { fmtDate, fmtMoney } from '../utils/format';

/** Bảng lương tháng: tổng tiền các ca đã chấm công; bấm dòng để xem từng ca. */
export default function PayrollPage() {
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [selected, setSelected] = useState<PayrollRow | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['payrolls', month], queryFn: () => getPayroll(month) });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['payrolls', month, selected?.id],
    queryFn: () => getEmployeePayroll(selected!.id, month),
    enabled: !!selected,
  });

  const columns: TableProps<PayrollRow>['columns'] = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    {
      title: 'Nhân viên',
      render: (_, r) => (
        <span>
          <Typography.Text strong>{r.fullName}</Typography.Text>
          {r.status === 'RESIGNED' && <Tag style={{ marginInlineStart: 8 }}>Đã nghỉ</Tag>}
        </span>
      ),
    },
    { title: 'Chức vụ', dataIndex: 'position', width: 140 },
    { title: 'Số ca', dataIndex: 'shiftCount', width: 100, align: 'right' },
    { title: 'Tổng lương', dataIndex: 'total', width: 160, align: 'right', render: fmtMoney },
  ];

  const detailColumns: TableProps<Attendance>['columns'] = [
    { title: 'Ngày', dataIndex: 'workDate', width: 120, render: fmtDate },
    { title: 'Ca', render: (_, a) => `${a.shift.name} (${shiftTimeLabel(a.shift)})` },
    { title: 'Ghi chú', dataIndex: 'note', render: (v: string | null) => v ?? '' },
    { title: 'Tiền ca', dataIndex: 'payAmount', width: 130, align: 'right', render: fmtMoney },
  ];

  return (
    <Card
      title="Bảng lương"
      extra={
        <DatePicker
          picker="month"
          allowClear={false}
          format="MM/YYYY"
          value={dayjs(`${month}-01`)}
          onChange={(v) => v && setMonth(v.format('YYYY-MM'))}
        />
      }
    >
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items}
        pagination={false}
        onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
        summary={() =>
          data && (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <b>Tổng cộng</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <b>{data.totalShifts}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <b>{fmtMoney(data.total)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )
        }
      />

      <Modal
        title={selected ? `${selected.code} ${selected.fullName} · tháng ${dayjs(`${month}-01`).format('MM/YYYY')}` : ''}
        open={!!selected}
        footer={null}
        width={720}
        onCancel={() => setSelected(null)}
        destroyOnHidden
      >
        <Table
          rowKey="id"
          size="small"
          loading={detailLoading}
          columns={detailColumns}
          dataSource={detail?.items}
          pagination={false}
          summary={() =>
            detail && (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>{detail.shiftCount} ca</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <b>{fmtMoney(detail.total)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }
        />
      </Modal>
    </Card>
  );
}
