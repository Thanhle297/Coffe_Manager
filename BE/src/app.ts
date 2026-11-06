import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/errorHandler.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { customerRoutes } from './modules/customer/customer.routes.js';
import { customerTypeRoutes } from './modules/customer-type/customerType.routes.js';
import { ingredientCategoryRoutes } from './modules/ingredient-category/ingredientCategory.routes.js';
import { ingredientRoutes } from './modules/ingredient/ingredient.routes.js';
import { loyaltyRoutes } from './modules/loyalty/loyalty.routes.js';
import { prepRoutes } from './modules/prep/prep.routes.js';
import { stockCountRoutes } from './modules/stock-count/stockCount.routes.js';
import { stockInRoutes, stockOutRoutes } from './modules/stock/stock.routes.js';
import { supplierRoutes } from './modules/supplier/supplier.routes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

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

app.use(errorHandler);
