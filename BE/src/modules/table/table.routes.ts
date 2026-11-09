import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './table.controller.js';
import {
  createTableSchema,
  listTablesQuerySchema,
  tableIdParamSchema,
  tableStatusSchema,
  updateTableSchema,
} from './table.schema.js';

export const tableRoutes = Router();
const idParam = validate(tableIdParamSchema, 'params');

tableRoutes.use(authenticate);

tableRoutes.get('/', validate(listTablesQuerySchema, 'query'), controller.list);
tableRoutes.get('/:id', idParam, controller.get);
tableRoutes.patch('/:id/status', idParam, validate(tableStatusSchema), controller.setStatus);

tableRoutes.post('/', authorize(Role.MANAGER), validate(createTableSchema), controller.create);
tableRoutes.patch('/:id', authorize(Role.MANAGER), idParam, validate(updateTableSchema), controller.update);
tableRoutes.delete('/:id', authorize(Role.MANAGER), idParam, controller.remove);
