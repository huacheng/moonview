import { Router, type IRouter } from 'express';
import { handleLogin, handleAuthStatus, handleVerify } from '../auth.js';

export function createAuthRouter(): IRouter {
  const router = Router();
  router.post('/login', handleLogin);
  router.get('/status', handleAuthStatus);
  router.get('/verify', handleVerify);
  return router;
}
