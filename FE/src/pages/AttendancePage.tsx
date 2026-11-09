import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Checkbox, DatePicker, Dropdown, Flex, Form, Modal, Select, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { LeftOutlined, PlusOutlined, RightOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { getErrorMessage } from '../api/client';
import {
  createAttendances,
  deleteAttendance,
  listAttendances,
  listEmployees,
  listShifts,
  shiftTimeLabel,
  type Attendance,
} from '../api/employees';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const mondayOf = (d: Dayjs) => d.subtract((d.day() + 6) % 7, 'day').startOf('day');
const ymd = (d: Dayjs) => d.format('YYYY-MM-DD');

interface Row {
  id: number;
  code: string;
  fullName: string;
}

interface BatchValues {
  workDate: Dayjs;
  shiftId: number;
  employeeIds: number[];
}

/** Chấm công theo tuần: bảng nhân viên × ngày; bấm + trong ô để thêm ca, bấm × trên ca để xóa. */
export default function AttendancePage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  const [batchOpen, setBatchOpen] = useState(false);
  const [form] = Form.useForm<BatchValues>();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);
  const from = ymd(days[0]);
  const to = ymd(days[6]);

  const { data: employees } = useQuery({
    queryKey: ['employees', 'working'],
    queryFn: () => listEmployees({ status: 'WORKING', pageSize: 100 }),
  });
  const { data: shifts } = useQuery({ queryKey: ['shifts', 'active'], queryFn: () => listShifts() });
  const { data: attendances, isLoading } = useQuery({
    queryKey: ['attendances', from, to],
    queryFn: () => listAttendances({ from, to }),
  });

  // Nhân viên đang làm, cộng người đã nghỉ nhưng có ca trong tuần.
  const rows = useMemo<Row[]>(() => {
    const map = new Map<number, Row>();
    for (const e of employees?.items ?? []) map.set(e.id, e);
    for (const a of attendances ?? []) if (!map.has(a.employeeId)) map.set(a.employeeId, a.employee);
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [employees, attendances]);

  const byCell = useMemo(() => {
    const map = new Map<string, Attendance[]>();
    for (const a of attendances ?? []) {
      const key = `${a.employeeId}|${a.workDate}`;
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [attendances]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendances'] });
  const onError = (e: unknown) => message.error(getErrorMessage(e));

  const addMutation = useMutation({
    mutationFn: createAttendances,
    onSuccess: (rows) => {
      message.success(`Đã chấm công ${rows.length} ca`);
      setBatchOpen(false);
      refresh();
    },
    onError,
  });

  const removeMutation = useMutation({ mutationFn: deleteAttendance, onSuccess: refresh, onError });

  const openBatch = () => {
    form.resetFields();
    const today = dayjs();
    form.setFieldsValue({ workDate: today.isBefore(days[0]) || today.isAfter(days[6]) ? days[0] : today, employeeIds: [] });
    setBatchOpen(true);
  };

  const columns: TableProps<Row>['columns'] = [
    {
      title: 'Nhân viên',
      fixed: 'left',
      width: 180,
      render: (_, r) => (
        <span>
          <b>{r.code}</b> {r.fullName}
        </span>
      ),
    },
    ...days.map((d) => ({
      key: ymd(d),
      title: (
        <span style={{ color: d.isSame(dayjs(), 'day') ? '#1677ff' : undefined }}>
          {WEEKDAYS[d.day()]} {d.format('DD/MM')}
        </span>
      ),
      width: 150,
      render: (_: unknown, r: Row) => {
        const cell = byCell.get(`${r.id}|${ymd(d)}`) ?? [];
        const taken = new Set(cell.map((a) => a.shiftId));
        const options = (shifts ?? []).filter((s) => !taken.has(s.id));
        return (
          <Flex wrap gap={4} align="center">
            {cell.map((a) => (
              <Tooltip key={a.id} title={`${shiftTimeLabel(a.shift)}${a.note ? ` · ${a.note}` : ''}`}>
                <Tag color="green" closable onClose={(e) => {
                  e.preventDefault();
                  removeMutation.mutate(a.id);
                }}>
                  {a.shift.name}
                </Tag>
              </Tooltip>
            ))}
            {options.length > 0 && employees?.items.some((e) => e.id === r.id) && (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: options.map((s) => ({ key: s.id, label: `${s.name} (${shiftTimeLabel(s)})` })),
                  onClick: ({ key }) =>
                    addMutation.mutate({ workDate: ymd(d), entries: [{ employeeId: r.id, shiftId: Number(key) }] }),
                }}
              >
                <Button size="small" type="dashed" icon={<PlusOutlined />} />
              </Dropdown>
            )}
          </Flex>
        );
      },
    })),
  ];

  return (
    <Card
      title="Chấm công"
      extra={
        <Flex gap={8}>
          <Button icon={<LeftOutlined />} onClick={() => setWeekStart(weekStart.subtract(7, 'day'))} />
          <DatePicker
            picker="week"
            allowClear={false}
            value={weekStart}
            format={() => `${days[0].format('DD/MM')} - ${days[6].format('DD/MM/YYYY')}`}
            onChange={(v) => v && setWeekStart(mondayOf(v))}
          />
          <Button icon={<RightOutlined />} onClick={() => setWeekStart(weekStart.add(7, 'day'))} />
          <Button onClick={() => setWeekStart(mondayOf(dayjs()))}>Tuần này</Button>
          <Button type="primary" icon={<TeamOutlined />} onClick={openBatch}>
            Chấm nhiều người
          </Button>
        </Flex>
      }
    >
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1250 }}
        size="small"
        bordered
      />

      <Modal
        title="Chấm công nhiều nhân viên"
        open={batchOpen}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={addMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setBatchOpen(false)}
        destroyOnHidden
      >
        <Form<BatchValues>
          form={form}
          layout="vertical"
          onFinish={(v) =>
            addMutation.mutate({
              workDate: ymd(v.workDate),
              entries: v.employeeIds.map((employeeId) => ({ employeeId, shiftId: v.shiftId })),
            })
          }
        >
          <Flex gap={16}>
            <Form.Item name="workDate" label="Ngày" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" allowClear={false} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="shiftId" label="Ca" rules={[{ required: true, message: 'Chọn ca' }]} style={{ flex: 1 }}>
              <Select options={shifts?.map((s) => ({ value: s.id, label: `${s.name} (${shiftTimeLabel(s)})` }))} />
            </Form.Item>
          </Flex>
          <Form.Item
            name="employeeIds"
            label="Nhân viên"
            rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một nhân viên' }]}
          >
            <Checkbox.Group style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {employees?.items.map((e) => (
                <Checkbox key={e.id} value={e.id}>
                  {e.code} {e.fullName}
                </Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
