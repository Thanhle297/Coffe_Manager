import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../src/lib/password.js';

describe('password', () => {
  it('băm không lưu dạng rõ và so khớp đúng', async () => {
    const hash = await hashPassword('Secret123');
    expect(hash).not.toContain('Secret123');
    expect(await verifyPassword('Secret123', hash)).toBe(true);
    expect(await verifyPassword('Secret124', hash)).toBe(false);
  });

  it('cùng một mật khẩu cho hai hash khác nhau (có salt)', async () => {
    expect(await hashPassword('Secret123')).not.toBe(await hashPassword('Secret123'));
  });

  it('mật khẩu tạm đủ dài tối thiểu 8 ký tự', () => {
    expect(generateTemporaryPassword()).toHaveLength(10);
  });
});
