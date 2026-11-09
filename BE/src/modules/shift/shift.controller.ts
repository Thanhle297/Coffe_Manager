import type { Request, Response } from 'express';
import * as service from './shift.service.js';
import type { ListShiftsQuery } from './shift.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listShifts(req.query as unknown as ListShiftsQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getShift(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createShift(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateShift(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  res.json(await service.removeShift(Number(req.params.id)));
}
