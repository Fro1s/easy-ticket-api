import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Best-effort extraction of the JWT `sub` for RATE-LIMIT KEYING ONLY.
 * This is NOT authentication — the token is not verified here; a forged
 * token can at worst pick which bucket it lands in, which does not grant
 * access. The real auth check still runs in the per-route JWT guard.
 */
function subFromBearer(req: {
  headers?: Record<string, unknown>;
}): string | null {
  const auth = req?.headers?.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Rate-limit by user id instead of IP whenever a bearer token is present, so
 * buyers sharing a public IP (CGNAT / office / a corporate proxy) are not
 * bucketed together and wrongly 429'd during a sale. Anonymous requests fall
 * back to IP (which is now the real client IP thanks to `trust proxy`).
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req?.user as { id?: string } | undefined;
    const key = user?.id ?? subFromBearer(req as { headers?: Record<string, unknown> });
    return Promise.resolve(key ? `user:${key}` : String(req.ip));
  }
}
