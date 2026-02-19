import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ── Token source ────────────────────────────────────────────────────────────
// NB_AUTH_TOKEN env var sets the shared secret. If unset, auth is disabled
// (open access — useful for local development).

const NB_AUTH_TOKEN = process.env['NB_AUTH_TOKEN'] ?? '';

/** Whether auth is enabled (non-empty NB_AUTH_TOKEN). */
export const authEnabled = NB_AUTH_TOKEN.length > 0;

// ── Helpers ─────────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const len = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
  const paddedB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
  return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

// ── Login endpoint handler ──────────────────────────────────────────────────

export function handleLogin(req: Request, res: Response): void {
  if (!authEnabled) {
    // Auth disabled — always grant access
    res.json({ ok: true });
    return;
  }

  const { token } = req.body as { token?: unknown };

  if (typeof token !== 'string' || !token) {
    res.status(401).json({ error: 'Token is required.' });
    return;
  }

  if (!timingSafeEqual(token, NB_AUTH_TOKEN)) {
    res.status(401).json({ error: 'Invalid token.' });
    return;
  }

  res.json({ ok: true });
}

// ── Auth status endpoint ────────────────────────────────────────────────────

export function handleAuthStatus(_req: Request, res: Response): void {
  res.json({ authEnabled });
}

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that checks for a valid Bearer token on every request
 * except the auth endpoints themselves and health check.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Always allow auth endpoints and health check
  if (
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/status' ||
    req.path === '/api/health'
  ) {
    next();
    return;
  }

  // If auth is not configured, allow all requests
  if (!authEnabled) {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required.' });
    return;
  }

  const token = authHeader.slice(7);
  if (!timingSafeEqual(token, NB_AUTH_TOKEN)) {
    res.status(401).json({ error: 'Invalid token.' });
    return;
  }

  next();
}
