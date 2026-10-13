/** Pure helpers for `pnpm infra:ecs` (scripts/infra/ecs.ts), unit-tested in test/infra/. */

/**
 * A unique, readable image tag: `<short sha>[-dirty]-<UTC yyyymmddhhmmss>`. Unique per run, so every
 * deploy is a new task definition revision and ECS always rolls the service, even for the same commit.
 */
export function imageTag(shortSha: string, dirty: boolean, now: Date): string {
  if (!/^[0-9a-f]{4,40}$/.test(shortSha)) throw new Error(`not a git sha: "${shortSha}"`);
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${shortSha}${dirty ? '-dirty' : ''}-${stamp}`;
}

/** True when a /health response body says the API and its database are up. */
export function isHealthy(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { status?: unknown; db?: unknown };
    return parsed.status === 'ok' && parsed.db === 'up';
  } catch {
    return false;
  }
}
