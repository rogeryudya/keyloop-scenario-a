/**
 * M7: run the API on ECS Fargate behind an ALB, on floci (docs/infrastructure.md › M7).
 *
 *   pnpm infra:ecs        build the runtime image → push to floci ECR → terraform apply → wait for /health
 *   pnpm infra:ecs:down   destroy the ECS stack (the data layer from envs/local stays)
 *
 * Needs only Docker or Podman. Terraform runs in the Compose `terraform` service (envs/local-ecs), and the
 * image is pushed with crane from a container: floci's registry speaks plain HTTP, which crane accepts
 * with --insecure, so no daemon `insecure-registries` setting is needed on any engine.
 */
import { spawnSync, SpawnSyncOptions } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageTag, isHealthy } from './ecs-helpers';

const CRANE_IMAGE = 'gcr.io/go-containerregistry/crane:v0.21.8';
const NETWORK = 'keyloop_default';
const LOCAL_URL = 'http://localhost:8080';
const HEALTH_TIMEOUT_MS = 180_000;

function run(command: string, args: string[], options: SpawnSyncOptions = {}): void {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${String(result.status)}`);
  }
}

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
  return result.stdout.trim();
}

const step = (text: string): void => console.log(`\n▶ ${text}`);
const terraform = (...args: string[]): string[] => [
  'compose',
  '--profile',
  'tools',
  'run',
  '--rm',
  ...args,
];
const tfOutput = (name: string): string =>
  capture('docker', terraform('terraform', 'ecs-output', name));

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (isHealthy(await res.text())) return true;
    } catch {
      // Not listening yet: the ALB starts forwarding once the task registers.
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return false;
}

async function up(): Promise<void> {
  step('Data layer: floci, otel-lgtm, RDS + DB secret, migrations and seed');
  run('docker', ['compose', 'up', '-d', '--wait', 'floci', 'otel-lgtm']);
  run('docker', ['compose', '--profile', 'app', 'run', '--rm', 'migrate']);

  step('ECR repository');
  run('docker', terraform('terraform', 'ecs-repo'));
  const repository = tfOutput('repository_url');

  const sha = capture('git', ['rev-parse', '--short', 'HEAD']);
  const dirty = capture('git', ['status', '--porcelain']) !== '';
  const tag = imageTag(sha, dirty, new Date());
  const local = `keyloop-api:${tag}`;

  step(`Build the runtime image ${local}`);
  // Also tagged with its ECR name: floci starts ECS tasks through this engine (Docker socket), which would
  // otherwise try to pull the image over HTTPS from floci's plain-HTTP registry and fail.
  run('docker', ['build', '--target', 'runtime', '-t', local, '-t', `${repository}:${tag}`, '.']);

  step(`Push to ${repository}:${tag}`);
  const dir = mkdtempSync(join(tmpdir(), 'keyloop-ecs-'));
  try {
    run('docker', ['save', '-o', join(dir, 'image.tar'), local]);
    const flociId = capture('docker', ['compose', 'ps', '-q', 'floci']);
    const flociIp = capture('docker', [
      'inspect',
      flociId,
      '--format',
      `{{(index .NetworkSettings.Networks "${NETWORK}").IPAddress}}`,
    ]);
    // The repository host (<account>.dkr.ecr.<region>.localhost) must reach floci from inside the container.
    const registryHost = repository.split(':')[0] ?? repository;
    run('docker', [
      'run', '--rm', '--network', NETWORK, '--add-host', `${registryHost}:${flociIp}`,
      '-v', `${dir}:/w:ro`, CRANE_IMAGE, 'push', '--insecure', '/w/image.tar', `${repository}:${tag}`,
    ]); // prettier-ignore
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  step('Network, ALB, ECS service (terraform apply)');
  run('docker', terraform('-e', `TF_VAR_image_tag=${tag}`, 'terraform', 'ecs-up'));

  step(`Wait for ${LOCAL_URL}/health through the ALB`);
  if (!(await waitForHealth(`${LOCAL_URL}/health`, HEALTH_TIMEOUT_MS))) {
    throw new Error(
      `the API didn't become healthy within ${HEALTH_TIMEOUT_MS / 1000} s. ` +
        `Task logs: docker logs $(docker ps -qf name=floci-aws-ecs-) or CloudWatch ${tfOutput('log_group_name')}`,
    );
  }

  console.log(`
✔ The API runs on ECS behind the ALB.
  URL        ${LOCAL_URL}/health · ${LOCAL_URL}/docs
  Image      ${tfOutput('image')}
  Cluster    ${tfOutput('cluster_name')} / service ${tfOutput('service_name')}
  Logs       CloudWatch ${tfOutput('log_group_name')} · docker logs <floci-aws-ecs-… container>
  Remove     pnpm infra:ecs:down`);
}

function down(): void {
  step('Destroy the ECS stack (envs/local-ecs)');
  run('docker', terraform('terraform', 'ecs-down'));
}

const action = process.argv[2] ?? 'up';
const main = action === 'down' ? Promise.resolve(down()) : action === 'up' ? up() : undefined;
if (!main) {
  console.error('usage: tsx scripts/infra/ecs.ts [up|down]');
  process.exitCode = 2;
} else {
  main.catch((error: unknown) => {
    console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
