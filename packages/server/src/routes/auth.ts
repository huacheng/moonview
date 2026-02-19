import { Router, type IRouter } from 'express';
import { handleLogin, handleAuthStatus } from '../auth.js';

export function createAuthRouter(): IRouter {
  const router = Router();
  router.post('/login', handleLogin);
  router.get('/status', handleAuthStatus);
  return router;
}
