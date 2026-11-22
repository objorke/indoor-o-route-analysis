/**
 * Event file loader for this CLI: installs the linkedom DOMParser (needed for
 * IOF XML in Node) and re-exports the shared loader from
 * `@indoor-o-route-analysis/core/node`, which every CLI uses.
 */
import { DOMParser } from "linkedom";

// Polyfill browser DOMParser for Node.js so IOF XML parsing works
// @ts-expect-error — polyfilling browser API for Node.js
globalThis.DOMParser = DOMParser;

export { loadEventFile } from "@indoor-o-route-analysis/core/node";
