import { describe, it, expect } from 'vitest';
import { LoginThrottle } from './rate-limit.js';

describe('LoginThrottle', () => {
  it('khóa mềm sau maxFailures lần sai, rồi tự mở khi hết lockMs', () => {
    let t = 0;
    const th = new LoginThrottle({ maxFailures: 3, windowMs: 1000, lockMs: 500, now: () => t });

    expect(th.check('a@x.test').allowed).toBe(true);
    expect(th.recordFailure('a@x.test').locked).toBe(false);
    expect(th.recordFailure('a@x.test').locked).toBe(false);
    expect(th.recordFailure('a@x.test').locked).toBe(true); // lần thứ 3 -> khóa

    const c = th.check('a@x.test');
    expect(c.allowed).toBe(false);
    expect(c.retryAfterSec).toBeGreaterThan(0);

    t += 499;
    expect(th.check('a@x.test').allowed).toBe(false);
    t += 2;
    expect(th.check('a@x.test').allowed).toBe(true); // hết khóa
  });

  it('đăng nhập thành công xóa bộ đếm', () => {
    const th = new LoginThrottle({ maxFailures: 3, windowMs: 1000, lockMs: 500, now: () => 0 });
    th.recordFailure('b@x.test');
    th.recordFailure('b@x.test');
    th.recordSuccess('b@x.test');
    expect(th.recordFailure('b@x.test').locked).toBe(false); // đếm lại từ đầu
  });

  it('bộ đếm reset khi qua cửa sổ thời gian', () => {
    let t = 0;
    const th = new LoginThrottle({ maxFailures: 3, windowMs: 1000, lockMs: 500, now: () => t });
    th.recordFailure('c@x.test');
    th.recordFailure('c@x.test');
    t += 1001; // qua windowMs
    expect(th.recordFailure('c@x.test').locked).toBe(false);
  });

  it('email phân biệt hoa/thường được chuẩn hoá', () => {
    const th = new LoginThrottle({ maxFailures: 2, windowMs: 1000, lockMs: 500 });
    th.recordFailure('D@x.test');
    expect(th.recordFailure('d@x.test').locked).toBe(true);
  });
});
