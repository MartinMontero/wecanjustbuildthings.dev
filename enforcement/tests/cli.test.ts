import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression coverage for the CLI's work-state / exit-code contract (issue #1):
// `layer1 --tree <clean>` scanned manifests cleanly but exited 2 ("Nothing was
// scanned") because the tree branch never set didWork. CI's dogfood step
// (`layer1 --tree . && layer2 --tree .`) therefore failed on a clean repo.

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');

function runCli(args: string[], reportDir: string) {
  // cwd stays the repo root so `--import tsx` resolves from node_modules; reports
  // are redirected into a temp dir so the run never touches the repo.
  mkdirSync(reportDir, { recursive: true });
  return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args, '--report-dir', reportDir], { encoding: 'utf8' });
}

test('layer1 --tree on a clean manifest tree exits 0 (didWork set on the tree branch)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enf-cli-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sample', dependencies: { 'nostr-tools': '^2.0.0' } }));
    const r = runCli(['layer1', '--tree', dir], join(dir, 'reports'));
    assert.equal(r.status, 0, `expected exit 0\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /manifests clean/);
    assert.doesNotMatch(r.stdout, /Nothing was scanned/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('layer1 with no scan target still exits 2 (empty-command guard preserved)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enf-cli-'));
  try {
    const r = runCli(['layer1'], join(dir, 'reports'));
    assert.equal(r.status, 2);
    assert.match(r.stdout, /Nothing was scanned/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
