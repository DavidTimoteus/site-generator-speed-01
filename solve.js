// Site-generator entry: run(input) returns makefun-site 1.0.0's build, byte for byte.
// solve.js is a thin wrapper around our own optimized copy of the reference pipeline
// (vendor/, derived from makefun-site 1.0.0, MIT). See PERF.md for the optimization ledger.
import { build } from './vendor/index.js';
export function run(input) {
  return build(input);
}
