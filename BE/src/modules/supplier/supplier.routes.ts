import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './supplier.controller.js';
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierIdParamSchema,
  updateSupplierSchema,
} from './supplier.schema.js';

export const supplierRoutes = Router();
const idParam = validate(supplierIdParamSchema, 'params');

supplierRoutes.use(authenticate);

supplierRoutes.get('/', validate(listSuppliersQuerySchema, 'query'), controller.list);
supplierRoutes.get('/:id', idParam, controller.get);

supplierRoutes.post('/', authorize(Role.MANAGER), validate(createSupplierSchema), controller.create);
supplierRoutes.patch('/:id', authorize(Role.MANAGER), idParam, validate(updateSupplierSchema), controller.update);
supplierRoutes.delete('/:id', authorize(Role.MANAGER), idParam, controller.remove);
