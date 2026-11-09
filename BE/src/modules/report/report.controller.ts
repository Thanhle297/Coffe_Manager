import type { Request, Response } from 'express';
import * as service from './report.service.js';
import type { GroupedRangeQuery, RangeQuery } from './report.schema.js';

export async function revenue(req: Request, res: Response) {
  res.json(await service.getRevenue(req.query as unknown as GroupedRangeQuery));
}

export async function drinksSold(req: Request, res: Response) {
  res.json(await service.getDrinksSold(req.query as unknown as RangeQuery));
}

export async function profit(req: Request, res: Response) {
  res.json(await service.getProfit(req.query as unknown as GroupedRangeQuery));
}

export async function stockMovement(req: Request, res: Response) {
  res.json(await service.getStockMovement(req.query as unknown as RangeQuery));
}

export async function stockLevel(_req: Request, res: Response) {
  res.json(await service.getStockLevel());
}
