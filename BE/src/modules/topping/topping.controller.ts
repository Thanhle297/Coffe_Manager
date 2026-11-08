import type { Request, Response } from 'express';
import * as service from './topping.service.js';
import type { ListToppingsQuery } from './topping.schema.js';

const id = (req: Request) => Number(req.params.id);
const role = (req: Request) => req.user!.role;

export async function list(req: Request, res: Response) {
  res.json(await service.listToppings(req.query as unknown as ListToppingsQuery, role(req)));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getTopping(id(req), role(req)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createTopping(req.body, role(req)));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateTopping(id(req), req.body, role(req)));
}

export async function setDrinks(req: Request, res: Response) {
  res.json(await service.setToppingDrinks(id(req), req.body.drinkIds, role(req)));
}

export async function setAvailability(req: Request, res: Response) {
  res.json(await service.setToppingAvailability(id(req), req.body.isAvailable, role(req)));
}

export async function remove(req: Request, res: Response) {
  await service.removeTopping(id(req));
  res.status(204).end();
}
