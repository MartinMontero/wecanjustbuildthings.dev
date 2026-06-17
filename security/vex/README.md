# Accepted-risk records (OpenVEX)

When a CRITICAL vulnerability is reported but the build should **not** be blocked,
the reason is recorded here as a machine-readable [OpenVEX](https://openvex.dev)
document — never as a silent scanner ignore. This mirrors the catalog's
`verification_blocked_reason` discipline: an exception is allowed only when it is
written down and justified.

## When to add a VEX statement

- **Unfixable CRITICAL** — a critical with no fix available. The gate
  (`scripts/osv-critical-gate.sh`) already reports these as non-blocking; a VEX
  document records *why* they're tolerated and what the impact is.
- **Not exploitable here** — a critical whose vulnerable code path is genuinely
  unreachable in a static-site build (e.g. a server-only code path we never run).

A *fixable* critical is fixed by bumping the dependency — not VEX'd.

## Statement statuses (OpenVEX)

| status | meaning |
|---|---|
| `not_affected` | the product is not affected; **must** include a `justification` |
| `affected` | affected and action is needed (use sparingly — usually means "fix it") |
| `under_investigation` | triage in progress |
| `fixed` | already remediated |

For `not_affected`, use a standard `justification`, e.g.
`vulnerable_code_not_in_execute_path` or `vulnerable_code_not_present`, plus a
plain-language `impact_statement`.

## Files

One document per accepted risk, named `YYYY-<id>.openvex.json`. See
[`EXAMPLE.openvex.json`](./EXAMPLE.openvex.json) — it is a template, not an active
statement. Keep each VEX file in sync with the matching entry in
`osv-scanner.toml` / `.grype.yaml` when a scanner-level ignore is also needed.
