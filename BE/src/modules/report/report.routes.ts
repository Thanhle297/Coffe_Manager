import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './report.controller.js';
import { groupedRangeQuerySchema, rangeQuerySchema } from './report.schema.js';

export const reportRoutes = Router();
reportRoutes.use(authenticate, authorize(Role.MANAGER));
reportRoutes.get('/revenue', validate(groupedRangeQuerySchema, 'query'), controller.revenue);
reportRoutes.get('/drinks-sold', validate(rangeQuerySchema, 'query'), controller.drinksSold);
reportRoutes.get('/profit', validate(groupedRangeQuerySchema, 'query'), controller.profit);
reportRoutes.get('/stock-movement', validate(rangeQuerySchema, 'query'), controller.stockMovement);
reportRoutes.get('/stock-level', controller.stockLevel);
