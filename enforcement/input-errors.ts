// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fail-closed input handling for the tree scans (Layers 1 and 2).
 *
 * The engine can only vouch for what it actually read. A manifest, lockfile, or
 * directory it cannot read is therefore never reported as "clean": it becomes a
 * named InputError, and any InputError fails the run (non-zero exit). Before this
 * existed, a parse error was a warning and the file counted as clean, so a broken
 * pyproject.toml declaring an excluded package passed.
 */

/** Why an input could not be checked. These names appear verbatim in CLI output. */
export type InputErrorReason =
  /** The file exists but could not be read from disk. */
  | 'unreadable_file'
  /** A directory under --tree (or --tree itself) could not be listed, e.g. it does not exist. */
  | 'unreadable_directory'
  /** A manifest's syntax could not be parsed, or it parsed to the wrong shape. */
  | 'unparseable_manifest'
  /** A lockfile's syntax could not be parsed, or it parsed to the wrong shape. */
  | 'unparseable_lockfile'
  /** A lockfile format the engine recognises but has no reader for (e.g. bun.lock). */
  | 'unsupported_lockfile';

export interface InputError {
  file: string;
  reason: InputErrorReason;
  detail: string;
}

/** Thrown by a parser that cannot read its input. Callers turn it into an InputError. */
export class InputFailure extends Error {
  readonly reason: InputErrorReason;
  readonly file: string;
  readonly detail: string;

  constructor(reason: InputErrorReason, file: string, detail: string) {
    super(`${file}: ${detail} (${reason})`);
    this.name = 'InputFailure';
    this.reason = reason;
    this.file = file;
    this.detail = detail;
  }

  toInputError(): InputError {
    return { file: this.file, reason: this.reason, detail: this.detail };
  }
}

/** One-line, human-readable form used by the CLI. */
export function formatInputError(e: InputError): string {
  return `${e.file}: ${e.detail} (${e.reason})`;
}

/** First line of an error message (TOML/YAML errors append a multi-line code frame). */
export function firstLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split(/\r?\n/)[0]!.trim().replace(/:$/, '');
}

/**
 * A manifest or lockfile must parse to a mapping. JSON `[]` or a YAML scalar
 * parses without error but declares nothing readable, so it is a failure too.
 */
export function requireMapping(
  value: unknown,
  reason: InputErrorReason,
  file: string,
  format: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputFailure(reason, file, `parsed as ${format}, but the top level is not a mapping`);
  }
  return value as Record<string, unknown>;
}
