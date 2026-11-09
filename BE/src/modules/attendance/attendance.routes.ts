import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './attendance.controller.js';
import {
  attendanceBatchSchema,
  attendanceIdParamSchema,
  listAttendancesQuerySchema,
  payrollEmployeeParamSchema,
  payrollQuerySchema,
} from './attendance.schema.js';

export const attendanceRoutes = Router();
attendanceRoutes.use(authenticate, authorize(Role.MANAGER));
attendanceRoutes.get('/', validate(listAttendancesQuerySchema, 'query'), controller.list);
attendanceRoutes.post('/', validate(attendanceBatchSchema), controller.create);
attendanceRoutes.delete('/:id', validate(attendanceIdParamSchema, 'params'), controller.remove);

export const payrollRoutes = Router();
payrollRoutes.use(authenticate, authorize(Role.MANAGER));
payrollRoutes.get('/', validate(payrollQuerySchema, 'query'), controller.payroll);
payrollRoutes.get(
  '/:employeeId',
  validate(payrollEmployeeParamSchema, 'params'),
  validate(payrollQuerySchema, 'query'),
  controller.employeePayroll,
);
