import type { Request, Response } from 'express';
import * as service from './ingredient.service.js';
import type { ListIngredientsQuery, MovementsQuery } from './ingredient.schema.js';

const id = (req: Request) => Number(req.params.id);
const unitId = (req: Request) => Number(req.params.unitId);

export async function list(req: Request, res: Response) {
  res.json(await service.listIngredients(req.query as unknown as ListIngredientsQuery));
}

export async function lowStock(_req: Request, res: Response) {
  res.json(await service.getLowStock());
}

export async function get(req: Request, res: Response) {
  res.json(await service.getIngredient(id(req)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createIngredient(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateIngredient(id(req), req.body));
}

export async function remove(req: Request, res: Response) {
  await service.removeIngredient(id(req));
  res.status(204).end();
}

export async function lots(req: Request, res: Response) {
  res.json(await service.listLots(id(req)));
}

export async function movements(req: Request, res: Response) {
  res.json(await service.getMovements(id(req), req.query as unknown as MovementsQuery));
}

export async function listUnits(req: Request, res: Response) {
  res.json(await service.listPurchaseUnits(id(req)));
}

export async function createUnit(req: Request, res: Response) {
  res.status(201).json(await service.createPurchaseUnit(id(req), req.body));
}

export async function updateUnit(req: Request, res: Response) {
  res.json(await service.updatePurchaseUnit(id(req), unitId(req), req.body));
}

export async function removeUnit(req: Request, res: Response) {
  await service.removePurchaseUnit(id(req), unitId(req));
  res.status(204).end();
}

export async function getPrepRecipe(req: Request, res: Response) {
  res.json(await service.getPrepRecipe(id(req)));
}

export async function setPrepRecipe(req: Request, res: Response) {
  res.json(await service.setPrepRecipe(id(req), req.body));
}
