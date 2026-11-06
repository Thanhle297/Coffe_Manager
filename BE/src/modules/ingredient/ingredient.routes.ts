import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './ingredient.controller.js';
import {
  createIngredientSchema,
  createPurchaseUnitSchema,
  ingredientIdParamSchema,
  listIngredientsQuerySchema,
  movementsQuerySchema,
  prepRecipeSchema,
  purchaseUnitParamSchema,
  updateIngredientSchema,
  updatePurchaseUnitSchema,
} from './ingredient.schema.js';

export const ingredientRoutes = Router();
const idParam = validate(ingredientIdParamSchema, 'params');
const unitParam = validate(purchaseUnitParamSchema, 'params');
const manager = authorize(Role.MANAGER);

ingredientRoutes.use(authenticate);

ingredientRoutes.get('/', validate(listIngredientsQuerySchema, 'query'), controller.list);
// Phải đăng ký trước '/:id'.
ingredientRoutes.get('/low-stock', controller.lowStock);
ingredientRoutes.get('/:id', idParam, controller.get);

ingredientRoutes.post('/', manager, validate(createIngredientSchema), controller.create);
ingredientRoutes.patch('/:id', manager, idParam, validate(updateIngredientSchema), controller.update);
ingredientRoutes.delete('/:id', manager, idParam, controller.remove);

ingredientRoutes.get('/:id/lots', idParam, controller.lots);
ingredientRoutes.get('/:id/movements', idParam, validate(movementsQuerySchema, 'query'), controller.movements);

ingredientRoutes.get('/:id/purchase-units', idParam, controller.listUnits);
ingredientRoutes.post('/:id/purchase-units', manager, idParam, validate(createPurchaseUnitSchema), controller.createUnit);
ingredientRoutes.patch('/:id/purchase-units/:unitId', manager, unitParam, validate(updatePurchaseUnitSchema), controller.updateUnit);
ingredientRoutes.delete('/:id/purchase-units/:unitId', manager, unitParam, controller.removeUnit);

ingredientRoutes.get('/:id/prep-recipe', idParam, controller.getPrepRecipe);
ingredientRoutes.put('/:id/prep-recipe', manager, idParam, validate(prepRecipeSchema), controller.setPrepRecipe);
