import type { Request, Response } from 'express';
import * as accountService from './account.service.js';

export async function list(_req: Request, res: Response) {
  res.json(await accountService.listAccounts());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await accountService.createAccount(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await accountService.updateAccount(req.user!.id, Number(req.params.id), req.body));
}

export async function resetPassword(req: Request, res: Response) {
  res.json(await accountService.resetPassword(req.user!.id, Number(req.params.id)));
}
