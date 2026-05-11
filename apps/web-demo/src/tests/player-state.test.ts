import { describe, expect, it } from 'vitest';
import { canUseWebCodecs } from '../players/WebCodecsPlayer';

describe('webcodecs capability', () => {
  it('returns a boolean', () => {
    expect(typeof canUseWebCodecs()).toBe('boolean');
  });
});
