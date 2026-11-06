import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './account.controller.js';
import { createAccountSchema, idParamSchema, updateAccountSchema } from './account.schema.js';

export const accountRoutes = Router();

accountRoutes.use(authenticate, authorize(Role.MANAGER));

accountRoutes.get('/', controller.list);
accountRoutes.post('/', validate(createAccountSchema), controller.create);
accountRoutes.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateAccountSchema),
  controller.update,
);
accountRoutes.post('/:id/reset-password', validate(idParamSchema, 'params'), controller.resetPassword);
