/** Circuit breaker tối giản cho lời gọi nhà cung cấp AI (AI_BEHAVIOR.md §6). */
export interface BreakerOptions {
  failureThreshold: number; // số lần lỗi liên tiếp -> mở
  openMs: number; // thời gian mở trước khi thử lại
  now?: () => number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private readonly now: () => number;

  constructor(private readonly opts: BreakerOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  get isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.opts.openMs) {
      // half-open: cho thử một lần
      this.openedAt = null;
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) this.openedAt = this.now();
  }
}
