import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './employee.controller.js';
import {
  createEmployeeSchema,
  employeeIdParamSchema,
  linkAccountSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from './employee.schema.js';

export const employeeRoutes = Router();
const idParam = validate(employeeIdParamSchema, 'params');

employeeRoutes.use(authenticate, authorize(Role.MANAGER));

employeeRoutes.get('/', validate(listEmployeesQuerySchema, 'query'), controller.list);
employeeRoutes.get('/:id', idParam, controller.get);
employeeRoutes.post('/', validate(createEmployeeSchema), controller.create);
employeeRoutes.put('/:id', idParam, validate(updateEmployeeSchema), controller.update);
employeeRoutes.patch('/:id/account', idParam, validate(linkAccountSchema), controller.linkAccount);
employeeRoutes.delete('/:id', idParam, controller.remove);
