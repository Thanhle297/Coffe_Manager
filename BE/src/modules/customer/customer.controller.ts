import type { Request, Response } from 'express';
import * as service from './customer.service.js';
import type { ListCustomersQuery, PointHistoryQuery } from './customer.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listCustomers(req.query as unknown as ListCustomersQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getCustomer(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createCustomer(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateCustomer(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.removeCustomer(Number(req.params.id));
  res.status(204).end();
}

export async function pointHistory(req: Request, res: Response) {
  res.json(await service.getPointHistory(Number(req.params.id), req.query as unknown as PointHistoryQuery));
}

export async function adjustPoints(req: Request, res: Response) {
  res.json(await service.adjustPoints(req.user!.id, Number(req.params.id), req.body));
}
