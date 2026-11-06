import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './prep.controller.js';
import { createPrepBatchSchema, listPrepBatchesQuerySchema, prepBatchIdParamSchema } from './prep.schema.js';

/** Q5: Nhân viên và Quản lý đều được lập phiếu sơ chế. */
export const prepRoutes = Router();
prepRoutes.use(authenticate);
prepRoutes.get('/', validate(listPrepBatchesQuerySchema, 'query'), controller.list);
prepRoutes.get('/:id', validate(prepBatchIdParamSchema, 'params'), controller.get);
prepRoutes.post('/', validate(createPrepBatchSchema), controller.create);
