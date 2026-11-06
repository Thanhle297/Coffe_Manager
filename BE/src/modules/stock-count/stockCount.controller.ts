import type { Request, Response } from 'express';
import * as service from './stockCount.service.js';
import type { ListStockCountsQuery } from './stockCount.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listStockCounts(req.query as unknown as ListStockCountsQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getStockCount(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createStockCount(req.user!.id, req.body));
}
