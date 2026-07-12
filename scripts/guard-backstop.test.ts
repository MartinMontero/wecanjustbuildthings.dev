/**
 * B13 — the RULE-3 history-rewrite backstop recognizes GitHub's own
 * merge/squash commits (committer noreply@github.com) as intrinsically
 * protected, INDEPENDENT of origin/main freshness — the exact stale-ref
 * condition under which the container stop hook misfires its
 * `--amend --reset-author` advice (four false fires on 2026-07-11).
 * Drives the REAL hook (python3 .claude/hooks/guard.py) against throwaway
 * fixture repos, asserting its exit code: 0 = allowed, 2 = blocked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../.claude/hooks/guard.py', import.meta.url));
const AGENT = 'noreply@anthropic.com';
const GITHUB = 'noreply@github.com';

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'guard-b13-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
function commit(dir: string, msg: string, author: string, committer: string) {
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', msg], {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: author,
      GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: committer,
    },
  });
}
/** Feed the real hook the JSON it would receive for a Bash rewrite command. */
function guardExit(dir: string, command: string): number {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: dir });
  const res = spawnSync('python3', [GUARD], { input, encoding: 'utf8' });
  return res.status ?? -1;
}
const AMEND = 'git commit --amend --no-edit --reset-author';

test('B13: an agent-authored, agent-committed HEAD may be amended (no published ref needed)', () => {
  const dir = repo();
  try {
    commit(dir, 'work', AGENT, AGENT);
    assert.equal(guardExit(dir, AMEND), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('B13: a GitHub merge-style commit at HEAD is blocked — even with NO origin/main at all', () => {
  const dir = repo();
  try {
    commit(dir, 'Merge pull request #58', 'owner@users.noreply.github.com', GITHUB);
    assert.equal(guardExit(dir, AMEND), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('B13: a squash-style commit (agent author, GitHub committer) is blocked — the stale-ref-proof case', () => {
  const dir = repo();
  try {
    commit(dir, 'squashed slice', AGENT, GITHUB);
    assert.equal(guardExit(dir, AMEND), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('B13: a rebase range containing a GitHub merge commit is blocked even when origin/main is STALE', () => {
  const dir = repo();
  try {
    commit(dir, 'base', AGENT, AGENT);
    // origin/main pinned BELOW the merge commit — the stale-ref condition.
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: dir });
    commit(dir, 'Merge pull request #59', 'owner@users.noreply.github.com', GITHUB);
    commit(dir, 'new work', AGENT, AGENT);
    const rebase = 'git rebase --exec "git commit --amend --no-edit --reset-author" origin/main';
    assert.equal(guardExit(dir, rebase), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('B13: the same stale-ref rebase over ONLY agent commits stays allowed (no overreach)', () => {
  const dir = repo();
  try {
    commit(dir, 'base', AGENT, AGENT);
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: dir });
    commit(dir, 'wip-1', AGENT, AGENT);
    commit(dir, 'wip-2', AGENT, AGENT);
    const rebase = 'git rebase --exec "git commit --amend --no-edit --reset-author" origin/main';
    assert.equal(guardExit(dir, rebase), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
