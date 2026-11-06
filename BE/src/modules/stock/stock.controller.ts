import type { Request, Response } from 'express';
import * as service from './stock.service.js';
import type { ListStockInQuery, ListStockOutQuery } from './stock.schema.js';

export async function listIn(req: Request, res: Response) {
  res.json(await service.listStockIns(req.query as unknown as ListStockInQuery));
}

export async function getIn(req: Request, res: Response) {
  res.json(await service.getStockIn(Number(req.params.id)));
}

export async function createIn(req: Request, res: Response) {
  res.status(201).json(await service.createStockIn(req.user!.id, req.body));
}

export async function listOut(req: Request, res: Response) {
  res.json(await service.listStockOuts(req.query as unknown as ListStockOutQuery));
}

export async function getOut(req: Request, res: Response) {
  res.json(await service.getStockOut(Number(req.params.id)));
}

export async function createOut(req: Request, res: Response) {
  res.status(201).json(await service.createStockOut(req.user!, req.body));
}

export async function discardExpired(req: Request, res: Response) {
  res.json(await service.discardExpired(req.user!.id, req.body));
}
