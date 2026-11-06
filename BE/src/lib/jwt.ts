import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '../generated/prisma/enums.js';

export interface TokenPayload {
  sub: string;
  role: Role;
  ver: number;
}

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('Thiếu biến môi trường JWT_SECRET');
  return value;
};

export function signToken(account: { id: number; role: Role; tokenVersion: number }): string {
  const payload: TokenPayload = {
    sub: String(account.id),
    role: account.role,
    ver: account.tokenVersion,
  };
  return jwt.sign(payload, secret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '1d') as SignOptions['expiresIn'],
  });
}

/** Ném lỗi của jsonwebtoken nếu token sai hoặc hết hạn. */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret()) as TokenPayload;
}
