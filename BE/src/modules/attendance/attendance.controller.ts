import type { Request, Response } from 'express';
import * as service from './attendance.service.js';
import type { ListAttendancesQuery, PayrollQuery } from './attendance.schema.js';

export async function create(req: Request, res: Response) {
  res.status(201).json(await service.createAttendances(req.user!.id, req.body));
}

export async function list(req: Request, res: Response) {
  res.json(await service.listAttendances(req.query as unknown as ListAttendancesQuery));
}

export async function remove(req: Request, res: Response) {
  await service.removeAttendance(Number(req.params.id));
  res.status(204).end();
}

export async function payroll(req: Request, res: Response) {
  res.json(await service.getPayroll((req.query as unknown as PayrollQuery).month));
}

export async function employeePayroll(req: Request, res: Response) {
  const { month } = req.query as unknown as PayrollQuery;
  res.json(await service.getEmployeePayroll(Number(req.params.employeeId), month));
}
