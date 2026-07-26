export type D1BindableValue =
  | ArrayBuffer
  | ArrayBufferView
  | null
  | number
  | string;

export type D1Result<T = Record<string, unknown>> = Readonly<{
  success: boolean;
  results: T[];
  meta?: Readonly<Record<string, unknown>>;
  error?: string;
}>;

export interface D1PreparedStatement {
  bind(...values: D1BindableValue[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
  prepare(query: string): D1PreparedStatement;
}

export interface R2Bucket {
  get(key: string): Promise<unknown | null>;
  head(key: string): Promise<unknown | null>;
  put(
    key: string,
    value:
      | ArrayBuffer
      | ArrayBufferView
      | Blob
      | ReadableStream
      | string
      | null,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<unknown | null>;
}

type RuntimeBindings = Readonly<{
  BOOKS?: R2Bucket;
  DB?: D1Database;
}>;

const bindingsKey = Symbol.for("the-living-archive.runtime-bindings");

type GlobalWithBindings = typeof globalThis & {
  [bindingsKey]?: RuntimeBindings;
};

export function configureRuntimeBindings(bindings: RuntimeBindings): void {
  (globalThis as GlobalWithBindings)[bindingsKey] = Object.freeze({
    BOOKS: bindings.BOOKS,
    DB: bindings.DB,
  });
}

export function getD1Binding(): D1Database | null {
  return (globalThis as GlobalWithBindings)[bindingsKey]?.DB ?? null;
}

export function getBooksBinding(): R2Bucket | null {
  return (globalThis as GlobalWithBindings)[bindingsKey]?.BOOKS ?? null;
}
