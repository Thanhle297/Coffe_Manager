import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './loyalty.controller.js';
import { updateLoyaltySchema } from './loyalty.schema.js';

export const loyaltyRoutes = Router();

loyaltyRoutes.use(authenticate);
loyaltyRoutes.get('/', controller.get);
loyaltyRoutes.patch('/', authorize(Role.MANAGER), validate(updateLoyaltySchema), controller.update);
