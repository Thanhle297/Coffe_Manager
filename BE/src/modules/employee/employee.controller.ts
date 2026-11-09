import type { Request, Response } from 'express';
import * as service from './employee.service.js';
import type { ListEmployeesQuery } from './employee.schema.js';

export async function list(req: Request, res: Response) {
  res.json(await service.listEmployees(req.query as unknown as ListEmployeesQuery));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getEmployee(Number(req.params.id)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createEmployee(req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await service.updateEmployee(req.user!.id, Number(req.params.id), req.body));
}

export async function linkAccount(req: Request, res: Response) {
  res.json(await service.linkAccount(Number(req.params.id), req.body.accountId));
}

export async function remove(req: Request, res: Response) {
  res.json(await service.removeEmployee(req.user!.id, Number(req.params.id)));
}
