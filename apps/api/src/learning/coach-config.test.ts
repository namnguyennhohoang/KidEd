import { describe, it, expect } from 'vitest';
import { makeGateway } from './coach.js';
import { TEST_CONFIG } from '../test-support/harness.js';

const base = () => ({ ...TEST_CONFIG });

describe('makeGateway — chọn provider theo AI_PROVIDER', () => {
  it('PLUGGABLE / DETERMINISTIC / rỗng -> DeterministicProvider', () => {
    for (const v of ['PLUGGABLE', 'deterministic', '']) {
      expect(makeGateway({ ...base(), AI_PROVIDER: v }).primaryProvider).toBe("deterministic");
    }
  });

  it('ANTHROPIC thiếu key -> ném rõ ràng', () => {
    expect(() => makeGateway({ ...base(), AI_PROVIDER: 'ANTHROPIC', ANTHROPIC_API_KEY: '' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it('ANTHROPIC có key -> gateway dùng provider "anthropic"', () => {
    const gw = makeGateway({ ...base(), AI_PROVIDER: 'ANTHROPIC', ANTHROPIC_API_KEY: 'sk-test' });
    expect(gw.primaryProvider).toBe("anthropic");
  });

  it('AI_PROVIDER lạ -> ném', () => {
    expect(() => makeGateway({ ...base(), AI_PROVIDER: 'openai' })).toThrow();
  });
});
