import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './ingredientCategory.controller.js';
import {
  createIngredientCategorySchema,
  ingredientCategoryIdParamSchema,
  updateIngredientCategorySchema,
} from './ingredientCategory.schema.js';

export const ingredientCategoryRoutes = Router();
const idParam = validate(ingredientCategoryIdParamSchema, 'params');

ingredientCategoryRoutes.use(authenticate);
ingredientCategoryRoutes.get('/', controller.list);

ingredientCategoryRoutes.use(authorize(Role.MANAGER));
ingredientCategoryRoutes.post('/', validate(createIngredientCategorySchema), controller.create);
ingredientCategoryRoutes.patch('/:id', idParam, validate(updateIngredientCategorySchema), controller.update);
ingredientCategoryRoutes.delete('/:id', idParam, controller.remove);
