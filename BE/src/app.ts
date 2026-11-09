import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/errorHandler.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { customerRoutes } from './modules/customer/customer.routes.js';
import { drinkCategoryRoutes } from './modules/drink-category/drinkCategory.routes.js';
import { attendanceRoutes, payrollRoutes } from './modules/attendance/attendance.routes.js';
import { employeeRoutes } from './modules/employee/employee.routes.js';
import { shiftRoutes } from './modules/shift/shift.routes.js';
import { drinkRoutes } from './modules/drink/drink.routes.js';
import { customerTypeRoutes } from './modules/customer-type/customerType.routes.js';
import { ingredientCategoryRoutes } from './modules/ingredient-category/ingredientCategory.routes.js';
import { ingredientRoutes } from './modules/ingredient/ingredient.routes.js';
import { orderRoutes } from './modules/order/order.routes.js';
import { loyaltyRoutes } from './modules/loyalty/loyalty.routes.js';
import { prepRoutes } from './modules/prep/prep.routes.js';
import { reportRoutes } from './modules/report/report.routes.js';
import { stockCountRoutes } from './modules/stock-count/stockCount.routes.js';
import { stockInRoutes, stockOutRoutes } from './modules/stock/stock.routes.js';
import { supplierRoutes } from './modules/supplier/supplier.routes.js';
import { tableRoutes } from './modules/table/table.routes.js';
import { toppingRoutes } from './modules/topping/topping.routes.js';
import { UPLOAD_ROOT } from './middlewares/upload.js';

export const app = express();

// Cho phép FE khác cổng tải ảnh từ /uploads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use('/uploads', express.static(UPLOAD_ROOT));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/accounts', accountRoutes);
app.use('/customers', customerRoutes);
app.use('/customer-types', customerTypeRoutes);
app.use('/loyalty-settings', loyaltyRoutes);
app.use('/ingredient-categories', ingredientCategoryRoutes);
app.use('/ingredients', ingredientRoutes);
app.use('/suppliers', supplierRoutes);
app.use('/stock-in', stockInRoutes);
app.use('/stock-out', stockOutRoutes);
app.use('/prep-batches', prepRoutes);
app.use('/stock-counts', stockCountRoutes);
app.use('/drink-categories', drinkCategoryRoutes);
app.use('/drinks', drinkRoutes);
app.use('/toppings', toppingRoutes);
app.use('/tables', tableRoutes);
app.use('/orders', orderRoutes);
app.use('/employees', employeeRoutes);
app.use('/shifts', shiftRoutes);
app.use('/attendances', attendanceRoutes);
app.use('/payrolls', payrollRoutes);
app.use('/reports', reportRoutes);

app.use(errorHandler);
