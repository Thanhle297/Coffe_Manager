import type { Request, Response } from 'express';
import * as service from './ingredientCategory.service.js';

export async function list(_req: Request, res: Response) {
  res.json(await service.listIngredientCategories());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createIngredientCategory(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateIngredientCategory(Number(req.params.id), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.removeIngredientCategory(Number(req.params.id));
  res.status(204).end();
}
