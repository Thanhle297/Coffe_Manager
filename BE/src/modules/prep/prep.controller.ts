import type { Request, Response } from 'express';
import * as service from './prep.service.js';
import type { ListPrepBatchesQuery } from './prep.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listPrepBatches(req.query as unknown as ListPrepBatchesQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getPrepBatch(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createPrepBatch(req.user!.id, req.body));
}
