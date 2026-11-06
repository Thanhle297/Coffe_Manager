import { Router } from 'express';
import { authenticateAllowPending } from '../../middlewares/authenticate.js';
import { loginLimiter } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import { changePasswordSchema, loginSchema } from './auth.schema.js';

export const authRoutes = Router();

authRoutes.post('/login', loginLimiter, validate(loginSchema), controller.login);
authRoutes.get('/me', authenticateAllowPending, controller.me);
authRoutes.post(
  '/change-password',
  authenticateAllowPending,
  validate(changePasswordSchema),
  controller.changePassword,
);
