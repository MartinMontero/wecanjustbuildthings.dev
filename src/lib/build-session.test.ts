import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSession,
  migrate,
  updateSession,
  loadSession,
  saveSession,
  clearSession,
  hasSession,
  subscribeSession,
} from './build-session.ts';

test('defaultSession has the expected shape', () => {
  const s = defaultSession();
  assert.equal(s.v, 1);
  assert.equal(s.movement, 1);
  assert.deepEqual(s.intent.protocols, []);
  assert.deepEqual(s.intent.answers, {});
  assert.equal(s.converged, null);
  assert.deepEqual(s.adjustments, { swaps: {}, removed: [], extra: [] });
  assert.deepEqual(s.stack, []);
  assert.deepEqual(s.skills, []);
  assert.equal(s.seededTool, null);
  assert.equal(s.handoff, 'zip');
});

test('migrate fills missing keys and preserves provided ones', () => {
  const m = migrate({ v: 1, intent: { problem: 'help tenants report safely', protocols: ['nostr'] } });
  assert.equal(m.intent.problem, 'help tenants report safely');
  assert.deepEqual(m.intent.protocols, ['nostr']);
  assert.equal(m.intent.projectName, '');
  assert.deepEqual(m.intent.answers, {});
  assert.deepEqual(m.adjustments, { swaps: {}, removed: [], extra: [] });
});

test('migrate rejects non-v1 / garbage with a fresh default', () => {
  assert.equal(migrate(null).intent.problem, '');
  assert.equal(migrate({ v: 99 }).intent.problem, '');
  assert.equal(migrate('nope').intent.problem, '');
  assert.equal(migrate(undefined).movement, 1);
});

test('migrate deep-copies nested collections (no shared refs with source)', () => {
  const src = { v: 1 as const, adjustments: { swaps: { a: 'x' }, removed: ['r'], extra: [] } };
  const m = migrate(src);
  m.adjustments.removed.push('mutated');
  assert.deepEqual(src.adjustments.removed, ['r']);
});

test('updateSession merges and returns; does not persist without storage', () => {
  const next = updateSession((s) => ({ ...s, intent: { ...s.intent, problem: 'x' } }));
  assert.equal(next.intent.problem, 'x');
  assert.equal(next.v, 1);
  // No localStorage in node, so nothing is persisted — load still returns the default.
  assert.equal(loadSession().intent.problem, '');
});

// ---- migrate hardening: defensive coercion of tampered / legacy storage ----

test('migrate coerces a non-array intent.protocols to [] (consumer does new Set(...))', () => {
  assert.deepEqual(migrate({ v: 1, intent: { protocols: 'nostr' } }).intent.protocols, []);
  assert.deepEqual(migrate({ v: 1, intent: { protocols: ['a', 5, null, 'b'] } }).intent.protocols, ['a', 'b']);
});

test('migrate validates converged shape or nulls it (feeds new Set in the estimator)', () => {
  assert.equal(migrate({ v: 1, converged: { constraints: 'x' } }).converged, null); // no statement
  assert.deepEqual(
    migrate({ v: 1, converged: { statement: 's', constraints: 5, signals: ['realtime'] } }).converged,
    { statement: 's', constraints: [], signals: ['realtime'] },
  );
});

test('migrate clamps movement to 1..4', () => {
  assert.equal(migrate({ v: 1, movement: 99 }).movement, 1);
  assert.equal(migrate({ v: 1, movement: 3 }).movement, 3);
  assert.equal(migrate({ v: 1, movement: '2' }).movement, 1); // wrong type → default
});

test('migrate normalises intent.answers to an object of string | string[]', () => {
  assert.deepEqual(migrate({ v: 1, intent: { answers: ['x'] } }).intent.answers, {}); // array → {}
  assert.deepEqual(
    migrate({ v: 1, intent: { answers: { a: '1', b: 2, c: ['x', 3] } } }).intent.answers,
    { a: '1', c: ['x'] },
  );
});

// ---------------------------------------------------------------------------
// Persistence + cross-island pub/sub — the module's reason to exist. These run
// only in a browser, so we install a minimal localStorage + window (EventTarget)
// and tear it down per test in a finally, leaving the no-storage test above
// (which asserts the absence of storage) untouched.
// ---------------------------------------------------------------------------

const KEY = 'wcb.build-session.v1';

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
}

type Dom = { storage: FakeStorage; emitStorage: (key: string) => void };

function withFakeDom<T>(run: (dom: Dom) => T, opts: { failWrites?: boolean } = {}): T {
  const storage = new FakeStorage();
  if (opts.failWrites) storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const target = new EventTarget();
  const g = globalThis as Record<string, unknown>;
  const prev = { window: g.window, localStorage: g.localStorage };
  g.window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  g.localStorage = storage;
  const emitStorage = (key: string) => {
    const e = new Event('storage') as Event & { key: string };
    e.key = key;
    target.dispatchEvent(e);
  };
  try {
    return run({ storage, emitStorage });
  } finally {
    g.window = prev.window;
    g.localStorage = prev.localStorage;
  }
}

test('saveSession → loadSession round-trips and re-stamps updatedAt', () => {
  withFakeDom(() => {
    const s = defaultSession();
    s.intent.problem = 'help tenants report safely';
    const saved = saveSession(s);
    assert.notEqual(saved.updatedAt, new Date(0).toISOString()); // re-stamped to now
    const loaded = loadSession();
    assert.equal(loaded.intent.problem, 'help tenants report safely');
    assert.equal(loaded.v, 1);
  });
});

test('updateSession persists and notifies same-tab subscribers; unsubscribe stops it', () => {
  withFakeDom(() => {
    const seen: string[] = [];
    const off = subscribeSession((s) => seen.push(s.intent.goal));
    updateSession((s) => ({ ...s, intent: { ...s.intent, goal: 'ship it' } }));
    assert.deepEqual(seen, ['ship it']);
    assert.equal(loadSession().intent.goal, 'ship it'); // actually persisted
    off();
    updateSession((s) => ({ ...s, intent: { ...s.intent, goal: 'again' } }));
    assert.deepEqual(seen, ['ship it']); // no further notifications after unsubscribe
  });
});

test('subscribeSession reacts to another tab via the storage event (only for our key)', () => {
  withFakeDom(({ storage, emitStorage }) => {
    const seen: string[] = [];
    const off = subscribeSession((s) => seen.push(s.intent.problem));
    const other = { ...defaultSession(), intent: { ...defaultSession().intent, problem: 'from tab B' } };
    storage.setItem(KEY, JSON.stringify(other)); // another tab wrote the session
    emitStorage('some.other.key'); // different key → ignored
    assert.deepEqual(seen, []);
    emitStorage(KEY); // our key → reload + notify
    assert.deepEqual(seen, ['from tab B']);
    off();
  });
});

test('clearSession removes the key and notifies with a fresh default', () => {
  withFakeDom(({ storage }) => {
    saveSession({ ...defaultSession(), intent: { ...defaultSession().intent, problem: 'x' } });
    assert.notEqual(storage.getItem(KEY), null);
    const notified: string[] = [];
    const off = subscribeSession((s) => notified.push(s.intent.problem));
    clearSession();
    assert.equal(storage.getItem(KEY), null);
    assert.deepEqual(notified, ['']); // default session broadcast
    assert.equal(loadSession().intent.problem, '');
    off();
  });
});

test('hasSession reflects whether a session has been started', () => {
  withFakeDom(() => {
    assert.equal(hasSession(), false);
    saveSession(defaultSession());
    assert.equal(hasSession(), true);
    clearSession();
    assert.equal(hasSession(), false);
  });
});

test('saveSession degrades silently when the write throws (quota) but still notifies', () => {
  withFakeDom(() => {
    const notified: boolean[] = [];
    const off = subscribeSession(() => notified.push(true));
    const next = saveSession({ ...defaultSession(), intent: { ...defaultSession().intent, problem: 'big' } });
    assert.equal(next.intent.problem, 'big'); // returned in-memory
    assert.deepEqual(notified, [true]); // subscribers still told; flow continues in-memory
    assert.equal(loadSession().intent.problem, ''); // nothing persisted
    off();
  }, { failWrites: true });
});
