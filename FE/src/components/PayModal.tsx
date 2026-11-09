import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App as AntdApp, Button, Descriptions, Flex, InputNumber, Modal, Radio, Spin, Typography } from 'antd';
import { getErrorMessage } from '../api/client';
import { payOrder, previewOrder, type Order, type PaymentMethod } from '../api/orders';
import { colors } from '../theme';
import { fmtMoney, fmtNum } from '../utils/format';

interface Props {
  order: Order;
  open: boolean;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

/** Xem trước tiền (giảm hạng, đổi điểm), kiểm tra tồn kho, chọn phương thức và thanh toán. */
export default function PayModal({ order, open, onClose, onPaid }: Props) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [points, setPoints] = useState(0);
  const [debounced, setDebounced] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [given, setGiven] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setPoints(0);
    setDebounced(0);
    setMethod('CASH');
    setGiven(null);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(points), 300);
    return () => clearTimeout(t);
  }, [points]);

  const preview = useQuery({
    queryKey: ['order', order.id, 'preview', debounced],
    queryFn: () => previewOrder(order.id, debounced),
    enabled: open,
    retry: false,
    placeholderData: (prev) => prev,
  });
  const p = preview.data;

  const payMutation = useMutation({
    mutationFn: () => payOrder(order.id, { paymentMethod: method, redeemPoints: debounced }),
    onSuccess: (paid) => {
      message.success(`Đã thanh toán ${paid.code}`);
      queryClient.setQueryData(['order', paid.id], paid);
      for (const key of ['tables', 'orders', 'ingredients', 'customers', 'drinks']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onPaid(paid);
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  const shortage = (p?.shortages.length ?? 0) > 0;
  const canRedeem = !!p?.customer && p.loyaltyEnabled && p.maxRedeemPoints >= Math.max(1, p.minRedeemPoints);
  const change = given != null && p ? given - p.total : null;

  return (
    <Modal
      title={`Thanh toán ${order.code} · ${order.table.name}`}
      open={open}
      onCancel={onClose}
      width={520}
      footer={
        <Flex justify="end" gap={8}>
          <Button onClick={onClose}>Hủy</Button>
          <Button
            type="primary"
            loading={payMutation.isPending}
            disabled={!p || shortage || preview.isError || points !== debounced}
            onClick={() => payMutation.mutate()}
          >
            Xác nhận thanh toán {p ? fmtMoney(p.total) : ''}
          </Button>
        </Flex>
      }
    >
      <Spin spinning={preview.isLoading}>
        <Flex vertical gap={12}>
          {preview.isError && <Alert type="error" showIcon message={getErrorMessage(preview.error)} />}
          {shortage && (
            <Alert
              type="error"
              showIcon
              message="Không đủ nguyên liệu, chưa thể thanh toán"
              description={p!.shortages.map((s) => (
                <div key={s.ingredientId}>
                  {s.name}: cần {fmtNum(s.required)} {s.unit}, còn {fmtNum(s.available)} {s.unit}
                </div>
              ))}
            />
          )}
          {p && (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Tạm tính">{fmtMoney(p.subtotal)}</Descriptions.Item>
              {p.customer && (
                <Descriptions.Item label="Khách hàng">
                  {p.customer.fullName} · {p.customer.tierName} · {fmtNum(p.customer.points)} điểm
                </Descriptions.Item>
              )}
              {p.discountAmount > 0 && (
                <Descriptions.Item label={`Giảm hạng (${p.discountPercent}%)`}>-{fmtMoney(p.discountAmount)}</Descriptions.Item>
              )}
              {canRedeem && (
                <Descriptions.Item label="Dùng điểm">
                  <Flex align="center" gap={8} wrap>
                    <InputNumber
                      min={0}
                      max={p.maxRedeemPoints}
                      precision={0}
                      value={points}
                      onChange={(v) => setPoints(v ?? 0)}
                      style={{ width: 110 }}
                    />
                    <Button size="small" onClick={() => setPoints(p.maxRedeemPoints)}>
                      Tối đa {p.maxRedeemPoints}
                    </Button>
                    {p.redeemAmount > 0 && <Typography.Text type="success">-{fmtMoney(p.redeemAmount)}</Typography.Text>}
                  </Flex>
                  {p.minRedeemPoints > 0 && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Tối thiểu {p.minRedeemPoints} điểm mỗi lần đổi
                    </Typography.Text>
                  )}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Tổng thanh toán">
                <Typography.Text strong style={{ fontSize: 18, color: colors.brown }}>
                  {fmtMoney(p.total)}
                </Typography.Text>
              </Descriptions.Item>
              {p.customer && <Descriptions.Item label="Điểm được cộng">+{p.pointsEarned}</Descriptions.Item>}
            </Descriptions>
          )}
          <Radio.Group
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'CASH', label: 'Tiền mặt' },
              { value: 'TRANSFER', label: 'Chuyển khoản' },
            ]}
          />
          {method === 'CASH' && p && (
            <Flex align="center" gap={12} wrap>
              <span>Khách đưa</span>
              <InputNumber
                min={0}
                step={10000}
                value={given}
                onChange={setGiven}
                formatter={(v) => (v == null ? '' : Number(v).toLocaleString('vi-VN'))}
                parser={(v) => Number((v ?? '').replace(/\D/g, ''))}
                style={{ width: 160 }}
              />
              {change != null && (
                <Typography.Text type={change < 0 ? 'danger' : undefined}>
                  {change < 0 ? `Thiếu ${fmtMoney(-change)}` : `Tiền thối ${fmtMoney(change)}`}
                </Typography.Text>
              )}
            </Flex>
          )}
        </Flex>
      </Spin>
    </Modal>
  );
}
