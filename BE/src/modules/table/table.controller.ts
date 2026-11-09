import type { Request, Response } from 'express';
import * as service from './table.service.js';
import type { ListTablesQuery } from './table.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listTables(req.query as unknown as ListTablesQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getTable(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createTable(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateTable(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.removeTable(Number(req.params.id));
  res.status(204).end();
}

export async function setStatus(req: Request, res: Response) {
  res.json(await service.setTableStatus(Number(req.params.id), req.body.status));
}
