import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Form, Input, Modal } from 'antd';
import { getErrorMessage } from '../api/client';
import { createCustomer, type Customer, type CustomerInput } from '../api/customers';

interface Props {
  open: boolean;
  /** Chuỗi khách đang gõ ở ô tìm kiếm: là số thì điền sẵn SĐT, ngược lại điền sẵn họ tên. */
  initialText?: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

/** Thêm nhanh khách mua lần đầu ngay tại màn hình gọi món. */
export default function QuickCustomerModal({ open, initialText, onClose, onCreated }: Props) {
  const [form] = Form.useForm<CustomerInput>();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const text = (initialText ?? '').trim();
    const isPhone = /^[\d\s]+$/.test(text);
    form.setFieldsValue({ fullName: isPhone ? '' : text, phone: isPhone ? text.replace(/\s+/g, '') : '' });
  }, [open, initialText, form]);

  const mutation = useMutation({
    mutationFn: (v: CustomerInput) =>
      createCustomer({ fullName: v.fullName.trim(), phone: v.phone.replace(/\s+/g, '') }),
    onSuccess: (c) => {
      message.success(`Đã thêm khách ${c.fullName}`);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onCreated(c);
    },
    onError: (e) => message.error(getErrorMessage(e)),
  });

  return (
    <Modal
      title="Thêm khách hàng mới"
      open={open}
      okText="Thêm và gắn vào đơn"
      cancelText="Hủy"
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      forceRender
    >
      <Form<CustomerInput> form={form} layout="vertical" requiredMark={false} onFinish={(v) => mutation.mutate(v)}>
        <Form.Item
          label="Họ tên"
          name="fullName"
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }]}
        >
          <Input maxLength={100} autoFocus />
        </Form.Item>
        <Form.Item
          label="Số điện thoại"
          name="phone"
          rules={[
            { required: true, message: 'Vui lòng nhập số điện thoại' },
            {
              pattern: /^0\d{9}$/,
              transform: (v: string) => v?.replace(/\s+/g, ''),
              message: 'Số điện thoại gồm 10 chữ số và bắt đầu bằng 0',
            },
          ]}
        >
          <Input maxLength={14} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
