/** Shim: package typings are `.mts`; `moduleResolution: node` does not resolve them. */
declare module "tsx/esm/api" {
  export function tsImport(
    specifier: string | URL,
    options?: { parentURL?: string | URL }
  ): Promise<Record<string, unknown>>;
}
