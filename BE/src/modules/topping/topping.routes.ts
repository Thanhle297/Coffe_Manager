import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './topping.controller.js';
import {
  availabilitySchema,
  createToppingSchema,
  listToppingsQuerySchema,
  toppingDrinksSchema,
  toppingIdParamSchema,
  updateToppingSchema,
} from './topping.schema.js';

export const toppingRoutes = Router();
const idParam = validate(toppingIdParamSchema, 'params');

toppingRoutes.use(authenticate);
toppingRoutes.get('/', validate(listToppingsQuerySchema, 'query'), controller.list);
toppingRoutes.get('/:id', idParam, controller.get);

toppingRoutes.use(authorize(Role.MANAGER));
toppingRoutes.post('/', validate(createToppingSchema), controller.create);
toppingRoutes.put('/:id', idParam, validate(updateToppingSchema), controller.update);
toppingRoutes.put('/:id/drinks', idParam, validate(toppingDrinksSchema), controller.setDrinks);
toppingRoutes.patch('/:id/availability', idParam, validate(availabilitySchema), controller.setAvailability);
toppingRoutes.delete('/:id', idParam, controller.remove);
