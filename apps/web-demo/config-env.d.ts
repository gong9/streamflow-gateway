declare const __dirname: string;

declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}
