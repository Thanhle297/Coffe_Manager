import type { Request, Response } from 'express';
import * as service from './drink.service.js';
import type { ListDrinksQuery } from './drink.schema.js';

const id = (req: Request) => Number(req.params.id);
const role = (req: Request) => req.user!.role;

export async function list(req: Request, res: Response) {
  res.json(await service.listDrinks(req.query as unknown as ListDrinksQuery, role(req)));
}

export async function menu(_req: Request, res: Response) {
  res.json(await service.getMenu());
}

export async function get(req: Request, res: Response) {
  res.json(await service.getDrink(id(req), role(req)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createDrink(req.body, role(req)));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateDrink(id(req), req.body, role(req)));
}

export async function saveSizes(req: Request, res: Response) {
  res.json(await service.saveSizes(id(req), req.body.sizes, role(req)));
}

export async function setToppings(req: Request, res: Response) {
  res.json(await service.setDrinkToppings(id(req), req.body.toppingIds, role(req)));
}

export async function setAvailability(req: Request, res: Response) {
  res.json(await service.setDrinkAvailability(id(req), req.body.isAvailable, role(req)));
}

export async function setImage(req: Request, res: Response) {
  res.json(await service.setDrinkImage(id(req), req.file!.filename, role(req)));
}

export async function remove(req: Request, res: Response) {
  await service.removeDrink(id(req));
  res.status(204).end();
}
