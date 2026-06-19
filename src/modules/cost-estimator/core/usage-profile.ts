/**
 * usage-profile.ts — the bridge between the build session and the estimator.
 *
 * Browser-only: it reads from / writes to the shared build session (localStorage).
 * It is NOT imported by the Worker (which has no session). It consumes the Mentor
 * Engine's *qualitative* output (constraints/signals) to derive what it honestly
 * can — compute posture and whether a database is needed — and marks the numeric
 * fields (MAU / bandwidth / storage / db size) as missing so the UI can prompt for
 * ONLY those, writing the overrides back into the session.
 */
import type { BuildSession } from '../../../lib/build-session.ts';
import { updateSession } from '../../../lib/build-session.ts';
import { coerceUsageProfile } from './estimator.ts';
import type { ComputePosture, CostEstimate, UsageField, UsageProfile } from './types.ts';

function deriveCompute(constraints: Set<string>, signals: Set<string>): ComputePosture {
  if (signals.has('realtime')) return 'always-on'; // persistent connections
  if (constraints.has('local-first')) return 'edge'; // mostly client-side
  if (signals.has('hosting') || constraints.has('durable-data') || signals.has('storage')) return 'serverless';
  return 'edge';
}

/** Re-derive the qualitative fields from the session, preserving any manual entries. */
export function deriveUsageFromSession(session: BuildSession): UsageProfile {
  const constraints = new Set(session.converged?.constraints ?? []);
  const signals = new Set(session.converged?.signals ?? []);

  const compute = deriveCompute(constraints, signals);
  const dbNeeded = constraints.has('durable-data') || (signals.has('storage') && !constraints.has('local-first'));

  const derived: UsageProfile = {
    monthlyActiveUsers: null,
    bandwidthGB: null,
    storageGB: null,
    compute,
    database: { needed: dbNeeded, sizeGB: null },
    source: { compute: 'derived', database: 'derived' },
  };

  // session.usage comes from localStorage (untrusted) — sanitize before merging.
  const stored = session.usage ? coerceUsageProfile(session.usage) : null;
  return stored ? mergeUsage(derived, stored) : derived;
}

/** A manually-set field (source === 'manual') overrides the freshly-derived value. */
function mergeUsage(derived: UsageProfile, stored: UsageProfile): UsageProfile {
  const manual = (f: UsageField) => stored.source[f] === 'manual';
  const numeric = (f: 'monthlyActiveUsers' | 'bandwidthGB' | 'storageGB') =>
    manual(f) && stored[f] != null ? stored[f] : derived[f];
  return {
    monthlyActiveUsers: numeric('monthlyActiveUsers'),
    bandwidthGB: numeric('bandwidthGB'),
    storageGB: numeric('storageGB'),
    compute: manual('compute') ? stored.compute : derived.compute,
    database: {
      needed: derived.database?.needed ?? false,
      sizeGB: manual('database') ? (stored.database?.sizeGB ?? null) : (derived.database?.sizeGB ?? null),
    },
    source: { ...derived.source, ...stored.source },
  };
}

/** Fields the estimator still needs a value for (drives the manual-override form). */
export function missingUsageFields(usage: UsageProfile): UsageField[] {
  const missing: UsageField[] = [];
  if (usage.monthlyActiveUsers == null) missing.push('monthlyActiveUsers');
  if (usage.bandwidthGB == null) missing.push('bandwidthGB');
  if (usage.storageGB == null) missing.push('storageGB');
  if (usage.compute == null) missing.push('compute');
  if (usage.database == null) missing.push('database');
  else if (usage.database.needed && usage.database.sizeGB == null) missing.push('database');
  return missing;
}

/** Apply a manual override to one field and mark its source 'manual'. */
export function applyOverride(usage: UsageProfile, field: UsageField, value: number | ComputePosture | { needed: boolean; sizeGB: number | null }): UsageProfile {
  const next: UsageProfile = { ...usage, source: { ...usage.source, [field]: 'manual' } };
  if (field === 'compute') next.compute = value as ComputePosture;
  else if (field === 'database') next.database = value as { needed: boolean; sizeGB: number | null };
  else (next[field] as number | null) = value as number;
  return next;
}

/** Persist the usage profile back into the shared session (single source of truth). */
export function writeUsageToSession(usage: UsageProfile): void {
  updateSession((s) => ({ ...s, usage }));
}

/** Persist the computed estimate back into the shared session, under `costEstimate`. */
export function writeEstimateToSession(estimate: CostEstimate): void {
  updateSession((s) => ({ ...s, costEstimate: estimate }));
}
