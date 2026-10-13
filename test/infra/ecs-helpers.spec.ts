import { imageTag, isHealthy } from '../../scripts/infra/ecs-helpers';

describe('imageTag', () => {
  const now = new Date('2026-10-13T14:05:09.123Z');

  it('combines the short sha and a UTC timestamp', () => {
    expect(imageTag('1be23b2', false, now)).toBe('1be23b2-20261013140509');
  });

  it('marks a build from uncommitted changes', () => {
    expect(imageTag('1be23b2', true, now)).toBe('1be23b2-dirty-20261013140509');
  });

  it('is unique per second, so the same commit deploys again', () => {
    expect(imageTag('1be23b2', false, new Date('2026-10-13T14:05:10Z'))).not.toBe(
      imageTag('1be23b2', false, now),
    );
  });

  it.each(['', 'main', 'abc', '1BE23B2', 'g123456'])('rejects "%s" as a sha', (sha) => {
    expect(() => imageTag(sha, false, now)).toThrow('not a git sha');
  });

  it('produces a valid image tag (letters, digits, -, max 128 chars)', () => {
    expect(imageTag('a'.repeat(40), true, now)).toMatch(/^[\w][\w.-]{0,127}$/);
  });
});

describe('isHealthy', () => {
  it.each([
    ['{"status":"ok","db":"up"}', true],
    ['{"status":"ok","db":"down"}', false],
    ['{"error":{"code":"SERVICE_UNAVAILABLE"}}', false],
    ['Service unavailable', false],
    ['', false],
  ])('%s → %p', (body, expected) => {
    expect(isHealthy(body)).toBe(expected);
  });
});
