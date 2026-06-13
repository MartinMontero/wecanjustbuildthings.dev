import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProviderSignals } from '../config.ts';
import { compileSignals, scanText, runLayer3OnTree } from '../layer3-provider-strings/scanner.ts';

const signals = loadProviderSignals();
const compiled = compileSignals(signals);

test('detects OpenAI SDK imports', () => {
  const js = scanText(`import OpenAI from "openai";\nconst c = new OpenAI();\n`, 'a.ts', compiled);
  assert.ok(js.some((f) => f.org_key === 'openai' && f.signal_kind === 'import'));

  const py = scanText(`import openai\nclient = openai.OpenAI()\n`, 'a.py', compiled);
  assert.ok(py.some((f) => f.org_key === 'openai' && f.signal_kind === 'import'));
});

test('detects endpoints and config keys', () => {
  const env = scanText(`OPENAI_API_KEY=sk-xxxx\nXAI_API_KEY=xai-yyy\n`, '.env', compiled);
  assert.ok(env.some((f) => f.org_key === 'openai' && f.signal_kind === 'config_key'));
  assert.ok(env.some((f) => f.org_key === 'xai' && f.signal_kind === 'config_key'));

  const code = scanText(`const url = "https://api.openai.com/v1/chat";\n`, 'a.ts', compiled);
  assert.ok(code.some((f) => f.org_key === 'openai' && f.signal_kind === 'endpoint'));
});

test('detects Meta business SDK import', () => {
  const py = scanText(`from facebook_business.api import FacebookAdsApi\n`, 'a.py', compiled);
  assert.ok(py.some((f) => f.org_key === 'meta' && f.signal_kind === 'import'));
});

test('clean code produces no findings', () => {
  const clean = scanText(`import { SimplePool } from "nostr-tools";\nimport { Agent } from "@atproto/api";\n`, 'a.ts', compiled);
  assert.equal(clean.length, 0);
});

test('runLayer3OnTree scans code/config and ignores build dirs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wcb-l3-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.ts'), `import OpenAI from "openai";\n`);
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'x', 'index.js'), `import OpenAI from "openai";\n`);
    const report = runLayer3OnTree(dir, signals);
    assert.equal(report.status, 'block');
    assert.equal(report.findings.length, 1, 'node_modules must be ignored');
    assert.equal(report.findings[0]!.org_key, 'openai');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
