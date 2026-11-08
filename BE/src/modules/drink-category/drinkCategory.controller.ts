import type { Request, Response } from 'express';
import * as service from './drinkCategory.service.js';

export async function list(_req: Request, res: Response) {
  res.json(await service.listDrinkCategories());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createDrinkCategory(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateDrinkCategory(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.removeDrinkCategory(Number(req.params.id));
  res.status(204).end();
}
