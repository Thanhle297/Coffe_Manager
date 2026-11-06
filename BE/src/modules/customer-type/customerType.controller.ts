import type { Request, Response } from 'express';
import * as service from './customerType.service.js';

export async function list(_req: Request, res: Response) {
  res.json(await service.listCustomerTypes());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createCustomerType(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateCustomerType(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.deleteCustomerType(Number(req.params.id));
  res.status(204).end();
}
