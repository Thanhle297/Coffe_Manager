import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App as AntdApp, Button, Card, Form, Input, Typography } from 'antd';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/useAuth';

interface FormValues {
  oldPassword: string;
  newPassword: string;
  confirm: string;
}

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const onFinish = async ({ oldPassword, newPassword }: FormValues) => {
    setSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword);
      message.success('Đổi mật khẩu thành công');
      navigate('/', { replace: true });
    } catch (e) {
      message.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ maxWidth: 460, margin: '24px auto' }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Đổi mật khẩu
      </Typography.Title>

      {user?.mustChangePassword && (
        <Alert
          type="warning"
          showIcon
          title="Bạn đang dùng mật khẩu tạm do Quản lý cấp. Hãy đặt mật khẩu mới để tiếp tục."
          style={{ marginBottom: 16 }}
        />
      )}

      <Form<FormValues> form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
        <Form.Item
          label="Mật khẩu hiện tại"
          name="oldPassword"
          rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="Mật khẩu mới"
          name="newPassword"
          dependencies={['oldPassword']}
          extra="Tối thiểu 8 ký tự, không trùng mật khẩu cũ."
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu mới' },
            { min: 8, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' },
            { max: 72, message: 'Mật khẩu mới tối đa 72 ký tự' },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) =>
                !value || value !== getFieldValue('oldPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('Mật khẩu mới không được trùng mật khẩu cũ')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="Nhập lại mật khẩu mới"
          name="confirm"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Vui lòng nhập lại mật khẩu mới' },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) =>
                !value || value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('Mật khẩu nhập lại không khớp')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={submitting} block>
          Đổi mật khẩu
        </Button>
      </Form>
    </Card>
  );
}
