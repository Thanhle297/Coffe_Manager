import type { Request, Response } from 'express';
import * as loyaltyService from './loyalty.service.js';

export async function get(_req: Request, res: Response) {
  res.json(await loyaltyService.getSettings());
}

export async function update(req: Request, res: Response) {
  res.json(await loyaltyService.updateSettings(req.user!.id, req.body));
}
