import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './shift.controller.js';
import { createShiftSchema, listShiftsQuerySchema, shiftIdParamSchema, updateShiftSchema } from './shift.schema.js';

export const shiftRoutes = Router();
const idParam = validate(shiftIdParamSchema, 'params');

shiftRoutes.use(authenticate, authorize(Role.MANAGER));

shiftRoutes.get('/', validate(listShiftsQuerySchema, 'query'), controller.list);
shiftRoutes.get('/:id', idParam, controller.get);
shiftRoutes.post('/', validate(createShiftSchema), controller.create);
shiftRoutes.put('/:id', idParam, validate(updateShiftSchema), controller.update);
shiftRoutes.delete('/:id', idParam, controller.remove);
