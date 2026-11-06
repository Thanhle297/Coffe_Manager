import type { Request, Response } from 'express';
import * as authService from './auth.service.js';

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json(result);
}

export async function me(req: Request, res: Response) {
  res.json(await authService.getMe(req.user!.id));
}

export async function changePassword(req: Request, res: Response) {
  res.json(await authService.changePassword(req.user!.id, req.body));
}
