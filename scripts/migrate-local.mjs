import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export function migrateLocalDatabase() {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  const wrangler =
    process.platform === 'win32'
      ? 'node_modules/.bin/wrangler.cmd'
      : 'node_modules/.bin/wrangler';
  const migration = spawnSync(
    wrangler,
    [
      'd1',
      'migrations',
      'apply',
      'site-creator-d1',
      '--local',
      '--persist-to',
      '.wrangler/state',
      '--config',
      'wrangler.migrations.jsonc',
    ],
    { stdio: 'inherit', env: process.env },
  );

  if (migration.error || migration.status !== 0) {
    throw new Error(
      `TRACE could not initialize its local database${migration.error ? `: ${migration.error.message}` : '.'}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    migrateLocalDatabase();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'TRACE could not initialize its local database.',
    );
    process.exit(1);
  }
}
