declare module '@yarnpkg/lockfile' {
  export interface LockFileObject {
    [key: string]: {
      version?: string;
      resolved?: string;
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
  }
  export interface ParseResult {
    type: 'success' | 'merge' | 'conflict';
    object: LockFileObject;
  }
  export function parse(content: string): ParseResult;
  export function stringify(obj: LockFileObject): string;
  const _default: { parse: typeof parse; stringify: typeof stringify };
  export default _default;
}
