import { Router } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { uploadImage } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './drink.controller.js';
import {
  availabilitySchema,
  createDrinkSchema,
  drinkIdParamSchema,
  drinkToppingsSchema,
  listDrinksQuerySchema,
  saveSizesSchema,
  updateDrinkSchema,
} from './drink.schema.js';
import { IMAGE_FOLDER } from './drink.service.js';

export const drinkRoutes = Router();
const idParam = validate(drinkIdParamSchema, 'params');

drinkRoutes.use(authenticate);
drinkRoutes.get('/', validate(listDrinksQuerySchema, 'query'), controller.list);
drinkRoutes.get('/menu', controller.menu);
drinkRoutes.get('/:id', idParam, controller.get);

drinkRoutes.use(authorize(Role.MANAGER));
drinkRoutes.post('/', validate(createDrinkSchema), controller.create);
drinkRoutes.put('/:id', idParam, validate(updateDrinkSchema), controller.update);
drinkRoutes.put('/:id/sizes', idParam, validate(saveSizesSchema), controller.saveSizes);
drinkRoutes.put('/:id/toppings', idParam, validate(drinkToppingsSchema), controller.setToppings);
drinkRoutes.patch('/:id/availability', idParam, validate(availabilitySchema), controller.setAvailability);
drinkRoutes.post('/:id/image', idParam, uploadImage(IMAGE_FOLDER), controller.setImage);
drinkRoutes.delete('/:id', idParam, controller.remove);
