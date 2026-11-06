import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './customerType.controller.js';
import {
  createCustomerTypeSchema,
  typeIdParamSchema,
  updateCustomerTypeSchema,
} from './customerType.schema.js';

export const customerTypeRoutes = Router();

customerTypeRoutes.use(authenticate);
customerTypeRoutes.get('/', controller.list);

customerTypeRoutes.use(authorize(Role.MANAGER));
customerTypeRoutes.post('/', validate(createCustomerTypeSchema), controller.create);
customerTypeRoutes.patch(
  '/:id',
  validate(typeIdParamSchema, 'params'),
  validate(updateCustomerTypeSchema),
  controller.update,
);
customerTypeRoutes.delete('/:id', validate(typeIdParamSchema, 'params'), controller.remove);
