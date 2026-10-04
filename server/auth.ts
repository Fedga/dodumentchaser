import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './storage.js';
import { User, Firm, Session, UserRole } from './types.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: User;
      firm?: Firm;
      session?: Session;
    }
  }
}

export class AuthService {
  /**
   * Create a new session for a user and firm
   */
  public static createSession(user: User): Session {
    const data = db.getData();
    data.sessions = data.sessions || [];

    const token = `dcsess_${crypto.randomBytes(32).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session: Session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      token,
      userId: user.id,
      firmId: user.firmId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    data.sessions.push(session);
    db.commit();
    return session;
  }

  /**
   * Invalidate a session token
   */
  public static revokeSession(token: string): boolean {
    const data = db.getData();
    if (!data.sessions) return false;
    const index = data.sessions.findIndex(s => s.token === token);
    if (index !== -1) {
      data.sessions.splice(index, 1);
      db.commit();
      return true;
    }
    return false;
  }

  /**
   * Validate session token and return user & firm
   */
  public static validateToken(token: string): { user: User; firm: Firm; session: Session } | null {
    if (!token) return null;
    const data = db.getData();
    data.sessions = data.sessions || [];

    const session = data.sessions.find(s => s.token === token);
    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
      // Expired session
      this.revokeSession(token);
      return null;
    }

    const user = data.users.find(u => u.id === session.userId && u.firmId === session.firmId);
    if (!user) return null;

    const firm = data.firms.find(f => f.id === session.firmId);
    if (!firm) return null;

    return { user, firm, session };
  }

  /**
   * Helper to extract token from request
   */
  public static extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    if (req.headers['x-session-token']) {
      return String(req.headers['x-session-token']).trim();
    }
    // Also check query param if needed (e.g. for window open / download)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token.trim();
    }
    // Check cookie
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/dc_session=([^;]+)/);
      if (match) return match[1];
    }
    return null;
  }
}

/**
 * Middleware: Enforces that the request is made by an authenticated accountant.
 * Populates req.user, req.firm, and req.session.
 * Rejects unauthenticated requests with 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = AuthService.extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication required. Please sign in to access your practice workspace.',
      code: 'AUTH_REQUIRED',
    });
  }

  const result = AuthService.validateToken(token);
  if (!result) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired session. Please sign in again.',
      code: 'INVALID_SESSION',
    });
  }

  req.user = result.user;
  req.firm = result.firm;
  req.session = result.session;
  next();
}

/**
 * Middleware: Enforces role-based permissions (e.g., admin only).
 * Must be mounted AFTER requireAuth.
 */
export function requireRole(allowedRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required', code: 'AUTH_REQUIRED' });
    }

    if (req.user.role !== allowedRole) {
      return res.status(403).json({
        error: `Forbidden: This action requires "${allowedRole}" privileges. Your current role is "${req.user.role}".`,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
}
