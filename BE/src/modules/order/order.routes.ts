import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './order.controller.js';
import {
  addItemSchema,
  itemParamSchema,
  listOrdersQuerySchema,
  openOrderSchema,
  orderIdParamSchema,
  payOrderSchema,
  previewQuerySchema,
  setCustomerSchema,
  updateItemSchema,
  updateOrderSchema,
} from './order.schema.js';

export const orderRoutes = Router();
const idParam = validate(orderIdParamSchema, 'params');
const itemParam = validate(itemParamSchema, 'params');

// Q6: cả Quản lý và Nhân viên đều bán hàng; giới hạn xem lịch sử nằm ở service.
orderRoutes.use(authenticate);

orderRoutes.get('/', validate(listOrdersQuerySchema, 'query'), controller.list);
orderRoutes.post('/', validate(openOrderSchema), controller.open);
orderRoutes.get('/:id', idParam, controller.get);
orderRoutes.patch('/:id', idParam, validate(updateOrderSchema), controller.update);
orderRoutes.post('/:id/items', idParam, validate(addItemSchema), controller.addItem);
orderRoutes.patch('/:id/items/:itemId', itemParam, validate(updateItemSchema), controller.updateItem);
orderRoutes.delete('/:id/items/:itemId', itemParam, controller.removeItem);
orderRoutes.patch('/:id/customer', idParam, validate(setCustomerSchema), controller.setCustomer);
orderRoutes.get('/:id/preview', idParam, validate(previewQuerySchema, 'query'), controller.preview);
orderRoutes.post('/:id/pay', idParam, validate(payOrderSchema), controller.pay);
orderRoutes.post('/:id/cancel', idParam, controller.cancel);
