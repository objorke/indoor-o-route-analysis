/**
 * Browser persistence (IndexedDB), exported as `@indoor-o-route-analysis/core/storage`.
 * Kept out of the main entry so the domain package (used by the CLIs and the
 * MCP server in Node) doesn't depend on browser storage.
 */
export * from "./indexeddb";
