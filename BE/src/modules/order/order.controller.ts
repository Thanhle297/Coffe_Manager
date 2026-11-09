import type { Request, Response } from 'express';
import * as service from './order.service.js';
import type { ListOrdersQuery } from './order.schema.js';

const orderId = (req: Request) => Number(req.params.id);
const itemId = (req: Request) => Number(req.params.itemId);

export async function list(req: Request, res: Response) {
  res.json(await service.listOrders(req.query as unknown as ListOrdersQuery, req.user!));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getOrder(orderId(req), req.user!));
}

export async function open(req: Request, res: Response) {
  res.status(201).json(await service.openOrder(req.user!, req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateOrderNote(orderId(req), req.body.note, req.user!));
}

export async function addItem(req: Request, res: Response) {
  res.status(201).json(await service.addItem(orderId(req), req.body, req.user!));
}

export async function updateItem(req: Request, res: Response) {
  res.json(await service.updateItem(orderId(req), itemId(req), req.body, req.user!));
}

export async function removeItem(req: Request, res: Response) {
  res.json(await service.removeItem(orderId(req), itemId(req), req.user!));
}

export async function setCustomer(req: Request, res: Response) {
  res.json(await service.setCustomer(orderId(req), req.body.customerId, req.user!));
}

export async function preview(req: Request, res: Response) {
  const { redeemPoints } = req.query as unknown as { redeemPoints: number };
  res.json(await service.previewOrder(orderId(req), redeemPoints));
}

export async function pay(req: Request, res: Response) {
  res.json(await service.payOrder(orderId(req), req.body, req.user!));
}

export async function cancel(req: Request, res: Response) {
  res.json(await service.cancelOrder(orderId(req), req.user!));
}
