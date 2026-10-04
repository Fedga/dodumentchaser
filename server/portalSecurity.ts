import crypto from 'crypto';
import { db } from './storage.js';
import { DocumentRequest } from './types.js';

export interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

export class PortalSecurityService {
  // In-memory rate limiter for failed portal attempts: Map<IP, RateLimitEntry>
  private static failedAttempts = new Map<string, RateLimitEntry>();

  // Access log deduplication: Map<"tokenHash:ip", lastLoggedTimestamp>
  private static recentAccessLogs = new Map<string, number>();

  /**
   * Generates a cryptographically secure random portal token (256-bit entropy).
   * Completely non-sequential, opaque, and devoid of sensitive or internal identifiers.
   */
  public static generateSecureToken(): string {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `dcpt_${randomHex}`;
  }

  /**
   * Computes a SHA-256 hash of the portal token for secure comparison and storage.
   */
  public static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  }

  /**
   * Safe constant-time string comparison to mitigate timing attacks during verification.
   */
  public static timingSafeCompare(a: string, b: string): boolean {
    if (!a || !b) return false;
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Rate limiting: checks if an IP is currently blocked due to repeated failed attempts.
   */
  public static checkRateLimit(clientIp: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.failedAttempts.get(clientIp);

    if (!entry) return { allowed: true };

    if (entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    // Reset window after 15 minutes
    if (now - entry.firstAttemptAt > 15 * 60 * 1000) {
      this.failedAttempts.delete(clientIp);
      return { allowed: true };
    }

    return { allowed: true };
  }

  /**
   * Records a failed attempt for an IP. Blocks IP for 15 minutes after 5 consecutive failures.
   */
  public static recordFailedAttempt(clientIp: string): { blocked: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    let entry = this.failedAttempts.get(clientIp);

    if (!entry || now - entry.firstAttemptAt > 15 * 60 * 1000) {
      entry = { count: 1, firstAttemptAt: now };
      this.failedAttempts.set(clientIp, entry);
      return { blocked: false };
    }

    entry.count += 1;
    if (entry.count >= 5) {
      entry.blockedUntil = now + 15 * 60 * 1000; // Block for 15 minutes
      this.failedAttempts.set(clientIp, entry);
      return { blocked: true, retryAfterSeconds: 15 * 60 };
    }

    return { blocked: false };
  }

  /**
   * Resets failed attempts for an IP upon successful access.
   */
  public static recordSuccessfulAttempt(clientIp: string) {
    this.failedAttempts.delete(clientIp);
  }

  /**
   * Resets all rate limit entries (used for testing suites).
   */
  public static resetRateLimitsForTesting() {
    this.failedAttempts.clear();
    this.recentAccessLogs.clear();
  }

  /**
   * Extracts clean client IP address from Express Request headers or connection.
   */
  public static extractClientIp(req: any): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
  }

  /**
   * Validates a raw portal token against stored requests.
   * Performs SHA-256 hash comparison, expiration verification, and revocation check.
   */
  public static verifyToken(
    rawToken: string,
    clientIp: string
  ): {
    status: 'VALID' | 'INVALID' | 'EXPIRED' | 'REVOKED' | 'RATE_LIMITED';
    request?: DocumentRequest;
    retryAfterSeconds?: number;
  } {
    // 1. Check rate limit
    const rateCheck = this.checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return { status: 'RATE_LIMITED', retryAfterSeconds: rateCheck.retryAfterSeconds };
    }

    if (!rawToken || typeof rawToken !== 'string') {
      this.recordFailedAttempt(clientIp);
      return { status: 'INVALID' };
    }

    const providedHash = this.hashToken(rawToken);
    const data = db.getData();

    // Look for matching request by token hash (or legacy raw token for backward compatibility)
    const request = data.requests.find(r => {
      if (r.portalTokenHash && this.timingSafeCompare(r.portalTokenHash, providedHash)) {
        return true;
      }
      if (r.portalToken && this.timingSafeCompare(r.portalToken, rawToken)) {
        return true;
      }
      return false;
    });

    if (!request) {
      this.recordFailedAttempt(clientIp);
      return { status: 'INVALID' };
    }

    // 2. Check revocation
    if (request.portalTokenRevoked) {
      this.recordFailedAttempt(clientIp);
      return { status: 'REVOKED', request };
    }

    // 3. Check expiration
    if (request.portalTokenExpiresAt && new Date(request.portalTokenExpiresAt) < new Date()) {
      this.recordFailedAttempt(clientIp);
      return { status: 'EXPIRED', request };
    }

    // Success: clear failed rate limiting count
    this.recordSuccessfulAttempt(clientIp);
    return { status: 'VALID', request };
  }

  /**
   * Rotates a request's portal token: revokes existing token, generates a fresh one,
   * updates the cryptographic hash and expiration date, and records in audit log.
   */
  public static rotateToken(
    request: DocumentRequest,
    expiresInDays: number = 30,
    actorName: string = 'Accountant'
  ): { rawToken: string; expiresAt: string } {
    const rawToken = this.generateSecureToken();
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    request.portalToken = rawToken; // Stored so accountant can copy/email the link
    request.portalTokenHash = tokenHash;
    request.portalTokenExpiresAt = expiresAt;
    request.portalTokenRevoked = false;
    request.portalTokenLastRotatedAt = now.toISOString();
    request.updatedAt = now.toISOString();

    const data = db.getData();
    data.activityLogs.unshift({
      id: `act_${Date.now()}`,
      firmId: request.firmId,
      requestId: request.id,
      clientId: request.clientId,
      action: 'portal_token_rotated',
      description: `Portal security link rotated for "${request.name}". Previous token invalidated.`,
      actorType: 'accountant',
      actorName,
      createdAt: now.toISOString(),
    });

    db.commit();
    return { rawToken, expiresAt };
  }

  /**
   * Revokes a portal token, immediately preventing client access.
   */
  public static revokeToken(request: DocumentRequest, actorName: string = 'Accountant'): boolean {
    request.portalTokenRevoked = true;
    request.updatedAt = new Date().toISOString();

    const data = db.getData();
    data.activityLogs.unshift({
      id: `act_${Date.now()}`,
      firmId: request.firmId,
      requestId: request.id,
      clientId: request.clientId,
      action: 'portal_token_revoked',
      description: `Portal security link revoked for "${request.name}". Access blocked.`,
      actorType: 'accountant',
      actorName,
      createdAt: new Date().toISOString(),
    });

    db.commit();
    return true;
  }

  /**
   * Records a client portal access in the firm's audit log (with 10-minute debouncing per client IP).
   */
  public static logPortalAccess(request: DocumentRequest, clientIp: string) {
    const tokenHash = request.portalTokenHash || this.hashToken(request.portalToken || '');
    const logKey = `${tokenHash}:${clientIp}`;
    const now = Date.now();
    const lastLogged = this.recentAccessLogs.get(logKey);

    // Debounce to at most once per 10 minutes per IP
    if (lastLogged && now - lastLogged < 10 * 60 * 1000) {
      return;
    }

    this.recentAccessLogs.set(logKey, now);

    const data = db.getData();
    const client = data.clients.find(c => c.id === request.clientId);
    const clientName = client ? client.companyName : 'Client';

    data.activityLogs.unshift({
      id: `act_${Date.now()}`,
      firmId: request.firmId,
      requestId: request.id,
      clientId: request.clientId,
      action: 'portal_accessed',
      description: `${clientName} opened secure document upload portal for "${request.name}" (IP: ${clientIp})`,
      actorType: 'client',
      actorName: clientName,
      createdAt: new Date().toISOString(),
    });

    db.commit();
  }
}
