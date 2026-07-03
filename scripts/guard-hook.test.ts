/**
 * Tests for the PreToolUse guard hook (.claude/hooks/guard.py), RULE 3: a git
 * history rewrite must be blocked when it would touch a commit that is either
 * authored by someone other than the agent identity or already published on
 * origin/main. Each case runs the REAL hook via python3 against a throwaway git
 * repo built for that scenario — hermetic, no network, nothing shared.
 *
 * The suite skips (not fails) when python3 isn't on PATH, so the npm test run
 * stays green in environments without it; CI runners have python3.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GUARD = join(import.meta.dirname, '..', '.claude', 'hooks', 'guard.py');
const AGENT = 'noreply@anthropic.com';
const hasPython = spawnSync('python3', ['--version']).status === 0;

function git(cwd: string, ...args: string[]): void {
  const res = spawnSync('git', args, { cwd });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
}

/** A throwaway repo with one empty commit per given author email, oldest first. */
function repoWithCommits(emails: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'guard-hook-'));
  git(dir, 'init', '-q', '-b', 'main');
  for (const [i, email] of emails.entries()) {
    git(dir, '-c', `user.email=${email}`, '-c', 'user.name=Test', 'commit', '--allow-empty', '-q', '-m', `c${i}`);
  }
  return dir;
}

/** Run the hook exactly as the harness would: JSON on stdin, decision = exit code. */
function runGuard(command: string, cwd: string, tool = 'Bash'): { status: number | null; stderr: string } {
  const input = JSON.stringify({ tool_name: tool, tool_input: tool === 'Bash' ? { command } : { file_path: 'x.ts', content: command }, cwd });
  const res = spawnSync('python3', [GUARD], { input, encoding: 'utf8' });
  return { status: res.status, stderr: res.stderr };
}

const AMEND = 'git commit --amend --no-edit --reset-author';
const REBASE_AMEND = 'git rebase --exec "git commit --amend --no-edit --reset-author" origin/main';

test('guard RULE 3: amending a FOREIGN-authored HEAD is blocked', { skip: !hasPython }, () => {
  const repo = repoWithCommits(['someone@example.com']);
  try {
    const { status, stderr } = runGuard(AMEND, repo);
    assert.equal(status, 2);
    assert.match(stderr, /authored by <someone@example\.com>/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('guard RULE 3: amending an agent-authored, unpublished HEAD is allowed', { skip: !hasPython }, () => {
  const repo = repoWithCommits([AGENT]);
  try {
    assert.equal(runGuard(AMEND, repo).status, 0);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('guard RULE 3: amending a commit already on origin/main is blocked', { skip: !hasPython }, () => {
  const repo = repoWithCommits([AGENT]);
  try {
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD'); // simulate "published"
    const { status, stderr } = runGuard(AMEND, repo);
    assert.equal(status, 2);
    assert.match(stderr, /published on origin\/main/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('guard RULE 3: a rebase-amend whose range contains a foreign commit is blocked', { skip: !hasPython }, () => {
  const repo = repoWithCommits([AGENT]); // base commit → becomes origin/main
  try {
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(repo, '-c', 'user.email=github@example.com', '-c', 'user.name=Bot', 'commit', '--allow-empty', '-q', '-m', 'foreign');
    git(repo, '-c', `user.email=${AGENT}`, '-c', 'user.name=Claude', 'commit', '--allow-empty', '-q', '-m', 'mine');
    const { status, stderr } = runGuard(REBASE_AMEND, repo);
    assert.equal(status, 2);
    assert.match(stderr, /github@example\.com/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('guard RULE 3: non-rewrite git commands pass even on a foreign-authored HEAD', { skip: !hasPython }, () => {
  const repo = repoWithCommits(['someone@example.com']);
  try {
    for (const cmd of ['git commit -m "new work"', 'git status', 'git log --format=%ae -1']) {
      assert.equal(runGuard(cmd, repo).status, 0, `should allow: ${cmd}`);
    }
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('guard RULE 3: outside a git repo the backstop stays out of the way', { skip: !hasPython }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-hook-norepo-'));
  try {
    assert.equal(runGuard(AMEND, dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('guard RULE 3 does not fire for non-Bash tools; RULE 1 still blocks vendor installs', { skip: !hasPython }, () => {
  const repo = repoWithCommits(['someone@example.com']);
  try {
    // "--amend" inside Write content is prose, not a command
    assert.equal(runGuard(AMEND, repo, 'Write').status, 0);
    // RULE 1 regression: excluded-vendor install still blocked
    assert.equal(runGuard('npm install openai', repo).status, 2);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
