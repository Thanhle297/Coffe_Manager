import type { Request, Response } from 'express';
import * as service from './supplier.service.js';
import type { ListSuppliersQuery } from './supplier.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listSuppliers(req.query as unknown as ListSuppliersQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getSupplier(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createSupplier(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateSupplier(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.removeSupplier(Number(req.params.id));
  res.status(204).end();
}
