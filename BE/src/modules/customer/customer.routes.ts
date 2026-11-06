import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './customer.controller.js';
import {
  adjustPointsSchema,
  createCustomerSchema,
  customerIdParamSchema,
  listCustomersQuerySchema,
  pointHistoryQuerySchema,
  updateCustomerSchema,
} from './customer.schema.js';

export const customerRoutes = Router();
const idParam = validate(customerIdParamSchema, 'params');

customerRoutes.use(authenticate);

customerRoutes.get('/', validate(listCustomersQuerySchema, 'query'), controller.list);
customerRoutes.post('/', validate(createCustomerSchema), controller.create);
customerRoutes.get('/:id', idParam, controller.get);
customerRoutes.patch('/:id', idParam, validate(updateCustomerSchema), controller.update);
customerRoutes.get('/:id/points', idParam, validate(pointHistoryQuerySchema, 'query'), controller.pointHistory);

customerRoutes.delete('/:id', authorize(Role.MANAGER), idParam, controller.remove);
customerRoutes.post(
  '/:id/points/adjust',
  authorize(Role.MANAGER),
  idParam,
  validate(adjustPointsSchema),
  controller.adjustPoints,
);
