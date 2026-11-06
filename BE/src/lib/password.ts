import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

const cost = () => Number(process.env.BCRYPT_COST) || 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, cost());

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Bỏ các ký tự dễ nhầm (0/O, 1/l/I) để Quản lý đọc cho nhân viên không bị sai.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
