import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './stock.controller.js';
import {
  createStockInSchema,
  createStockOutSchema,
  discardExpiredSchema,
  listStockInQuerySchema,
  listStockOutQuerySchema,
  stockIdParamSchema,
} from './stock.schema.js';

const idParam = validate(stockIdParamSchema, 'params');

export const stockInRoutes = Router();
stockInRoutes.use(authenticate);
stockInRoutes.get('/', validate(listStockInQuerySchema, 'query'), controller.listIn);
stockInRoutes.get('/:id', idParam, controller.getIn);
stockInRoutes.post('/', authorize(Role.MANAGER), validate(createStockInSchema), controller.createIn);

export const stockOutRoutes = Router();
stockOutRoutes.use(authenticate);
stockOutRoutes.get('/', validate(listStockOutQuerySchema, 'query'), controller.listOut);
stockOutRoutes.get('/:id', idParam, controller.getOut);
// Nhân viên được lập USAGE/DISCARD; service chặn ADJUST (Q5).
stockOutRoutes.post('/', validate(createStockOutSchema), controller.createOut);
stockOutRoutes.post('/discard-expired', validate(discardExpiredSchema), controller.discardExpired);
