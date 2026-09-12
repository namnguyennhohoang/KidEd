/**
 * Giới hạn đăng nhập + khóa mềm theo email (SECURITY.md §3).
 * MVP: in-memory (đủ cho một tiến trình). Production nhiều instance -> chuyển sang Redis.
 */
export interface ThrottleConfig {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
  now?: () => number;
}

const DEFAULTS: Required<Omit<ThrottleConfig, 'now'>> = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  lockMs: 5 * 60_000,
};

interface Entry {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

export class LoginThrottle {
  private readonly cfg: Required<ThrottleConfig>;
  private readonly entries = new Map<string, Entry>();

  constructor(cfg: Partial<ThrottleConfig> = {}) {
    this.cfg = { ...DEFAULTS, now: () => Date.now(), ...cfg };
  }

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Gọi trước khi xác thực. */
  check(email: string): { allowed: boolean; retryAfterSec: number } {
    const e = this.entries.get(this.key(email));
    const now = this.cfg.now();
    if (e?.lockedUntil && e.lockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((e.lockedUntil - now) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Gọi khi mật khẩu sai. Trả true nếu lần này khiến tài khoản bị khóa mềm. */
  recordFailure(email: string): { locked: boolean } {
    const k = this.key(email);
    const now = this.cfg.now();
    let e = this.entries.get(k);
    if (!e || now - e.windowStart > this.cfg.windowMs) {
      e = { count: 0, windowStart: now };
    }
    e.count += 1;
    let locked = false;
    if (e.count >= this.cfg.maxFailures) {
      e.lockedUntil = now + this.cfg.lockMs;
      e.count = 0;
      e.windowStart = now;
      locked = true;
    }
    this.entries.set(k, e);
    return { locked };
  }

  recordSuccess(email: string): void {
    this.entries.delete(this.key(email));
  }
}
