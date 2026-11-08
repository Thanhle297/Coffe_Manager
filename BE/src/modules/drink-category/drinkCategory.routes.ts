import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './drinkCategory.controller.js';
import {
  createDrinkCategorySchema,
  drinkCategoryIdParamSchema,
  updateDrinkCategorySchema,
} from './drinkCategory.schema.js';

export const drinkCategoryRoutes = Router();
const idParam = validate(drinkCategoryIdParamSchema, 'params');

drinkCategoryRoutes.use(authenticate);
drinkCategoryRoutes.get('/', controller.list);

drinkCategoryRoutes.use(authorize(Role.MANAGER));
drinkCategoryRoutes.post('/', validate(createDrinkCategorySchema), controller.create);
drinkCategoryRoutes.patch('/:id', idParam, validate(updateDrinkCategorySchema), controller.update);
drinkCategoryRoutes.delete('/:id', idParam, controller.remove);
