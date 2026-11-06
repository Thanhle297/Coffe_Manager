import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './stockCount.controller.js';
import { createStockCountSchema, listStockCountsQuerySchema, stockCountIdParamSchema } from './stockCount.schema.js';

export const stockCountRoutes = Router();
stockCountRoutes.use(authenticate);
stockCountRoutes.get('/', validate(listStockCountsQuerySchema, 'query'), controller.list);
stockCountRoutes.get('/:id', validate(stockCountIdParamSchema, 'params'), controller.get);
stockCountRoutes.post('/', authorize(Role.MANAGER), validate(createStockCountSchema), controller.create);
