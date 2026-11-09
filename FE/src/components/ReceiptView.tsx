import { Button, Flex, Modal } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { orderStatusLabel, paymentLabel, type Order } from '../api/orders';
import { fmtDateTime } from '../utils/format';

const vnd = (n: number) => n.toLocaleString('vi-VN');

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 };
const hr: React.CSSProperties = { borderTop: '1px dashed #000', margin: '6px 0' };

/** Hóa đơn khổ 80mm; in bằng window.print() (CSS @media print trong index.css). */
export function ReceiptView({ order }: { order: Order }) {
  return (
    <div
      className="receipt-print"
      style={{
        width: '74mm',
        margin: '0 auto',
        padding: 8,
        fontFamily: "'Courier New', monospace",
        fontSize: 12,
        color: '#000',
        background: '#fff',
        lineHeight: 1.45,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>COFFEE MANAGER</div>
        <div style={{ fontWeight: 700, marginTop: 4 }}>
          {order.status === 'PAID' ? 'HÓA ĐƠN THANH TOÁN' : `PHIẾU TẠM TÍNH (${orderStatusLabel[order.status]})`}
        </div>
      </div>
      <div style={hr} />
      <div style={row}><span>Số HĐ:</span><span>{order.code}</span></div>
      <div style={row}><span>Bàn:</span><span>{order.table.name}</span></div>
      <div style={row}><span>Giờ vào:</span><span>{fmtDateTime(order.createdAt)}</span></div>
      {order.paidAt && <div style={row}><span>Thanh toán:</span><span>{fmtDateTime(order.paidAt)}</span></div>}
      <div style={row}><span>Thu ngân:</span><span>{order.staff.fullName}</span></div>
      {order.customer && (
        <div style={row}>
          <span>Khách:</span>
          <span>{order.customer.fullName} ({order.customer.customerType.name})</span>
        </div>
      )}
      <div style={hr} />
      {order.items.map((i) => (
        <div key={i.id} style={{ marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>
            {i.drinkName} ({i.sizeName})
          </div>
          {i.toppings.map((t) => (
            <div key={t.id} style={{ paddingLeft: 8 }}>
              + {t.name}
              {t.quantity > 1 ? ` x${t.quantity}` : ''}
            </div>
          ))}
          {i.note && <div style={{ paddingLeft: 8, fontStyle: 'italic' }}>* {i.note}</div>}
          <div style={row}>
            <span>
              {i.quantity} x {vnd(i.unitPrice)}
            </span>
            <span>{vnd(i.lineTotal)}</span>
          </div>
        </div>
      ))}
      <div style={hr} />
      <div style={row}><span>Tạm tính</span><span>{vnd(order.subtotal)}</span></div>
      {order.discountAmount > 0 && (
        <div style={row}><span>Giảm hạng ({order.discountPercent}%)</span><span>-{vnd(order.discountAmount)}</span></div>
      )}
      {order.redeemAmount > 0 && (
        <div style={row}><span>Dùng {order.pointsRedeemed} điểm</span><span>-{vnd(order.redeemAmount)}</span></div>
      )}
      <div style={{ ...row, fontSize: 15, fontWeight: 700, marginTop: 4 }}>
        <span>TỔNG CỘNG</span>
        <span>{vnd(order.status === 'PAID' ? order.total : order.subtotal)} đ</span>
      </div>
      {order.paymentMethod && <div style={row}><span>Phương thức</span><span>{paymentLabel[order.paymentMethod]}</span></div>}
      {order.pointsEarned > 0 && <div style={row}><span>Điểm tích lũy</span><span>+{order.pointsEarned}</span></div>}
      <div style={hr} />
      <div style={{ textAlign: 'center' }}>Cảm ơn quý khách, hẹn gặp lại!</div>
    </div>
  );
}

export function ReceiptModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  return (
    <Modal
      title="Hóa đơn"
      open={!!order}
      onCancel={onClose}
      width={380}
      footer={
        <Flex justify="end" gap={8}>
          <Button onClick={onClose}>Đóng</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            In hóa đơn
          </Button>
        </Flex>
      }
    >
      {order && <ReceiptView order={order} />}
    </Modal>
  );
}
