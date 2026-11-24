# PERF.md — site-generator-speed-01 optimization ledger

Method (perf-ops + performance-optimization): MEASURE baseline → IDENTIFY hotspots by
CPU profile → FIX one change at a time → VERIFY byte-identical on all practice cases
→ keep only wins that beat run-to-run noise, revert neutral/slower.
Local numbers are CPU (user+sys) of `run()` over the 3 practice cases, 1 CPU pinned
(`taskset -c 0`), median of 5 runs, `--no-incremental-marking`, Node v24.22.1.
Compare local numbers ONLY against the baseline measured the same way, on this machine.

## Baseline (reference makefun-site 1.0.0, verbatim)

- `bench/baseline/` (copy of kit baselines/makefun-site/)
- Correctness: **3/3 practice cases pass** (canonical compare vs expected.json)
- CPU: runs 572.0 / 584.8 / 595.5 / 563.1 / 603.9 ms → **median 584.8 ms**, mean 583.8 ms
  (spread ±3.5% — a win must clear ~±4% noise; aim for a large margin, the heat needs
  beating the baseline at 95% confidence)
- Full driver wall (startup + JSON parse/stringify + write): ~1.4 s — common overhead,
  identical for every entry; the ranking is decided by `run()` CPU.

## Profile (node --cpu-prof, 6 iterations x 3 cases, 3256 samples)

| Share | Site | Notes |
|---|---|---|
| ~27% | `escapeHtml` (text.js:6) | called once PER CHARACTER by `inline()` — regex per char |
| 11.8% | GC | allocation churn (slices, token objects, string concat) |
| ~10% | `inline` (markdown.js) | char-by-char loop itself |
| 7.9% | `renderMarkdown` | block loop + joins |
| ~4.3% | `RegExp \S+` via `wordsOf` | word count per card (and cardOf runs TWICE per post) |
| 2.5% | `parseFrontMatter` | regex per line |
| 2.3% | `lex` | regex per line (BLANK/FENCE/HEADING/HR/QUOTE/BULLET/ORDERED/CONTINUED) |
| 1.4% | `trimLine` regex | `^[ \t]+|[ \t]+$` per line |
| 0.6% | `\r\n?` regex | in readSources, per file |

## Experiments

| # | Change | Before → After (median, 5 runs) | Verdict | Why |
|---|---|---|---|---|
| 0 | baseline verbatim | 584.8 ms (standalone median, 5 runs) | baseline | — |
| 1 | `inline()`: escape plain runs in bulk (one `escapeHtml` per run, not per char) | standalone 584.8 → 289.5 ms; A/B vs baseline ratio **0.60** | **KEPT** | escapeHtml was ~27% of CPU; ~1.67x steady-state speedup, 3/3 cases byte-identical |
| 2 | `wordsOf()`: manual scan instead of `text.match(/\S+/g)` | A/B vs V1 ratio **0.922** (median of 7 interleaved rounds) | **KEPT** | ~8% win; exact-equivalent (ASCII fast path + /\s/ fallback for non-ASCII) |
| 3 | `pageOf()`: reuse the post's card from the cards map instead of recomputing it | A/B vs V2 ratio **0.899** (7/7 rounds B ≤ A) | **KEPT** | ~10% win; card object is only read afterwards, sharing is safe |
| 4 | `lex()`: manual char checks replacing all block regexes (BLANK, FENCE_OPEN/CLOSE, HEADING, HR, QUOTE, BULLET, ORDERED, CONTINUED, stripQuote, endsParagraph) | A/B #1 vs V3 ratio **0.975** (7 rounds, 5/7 favouring B — inside noise); A/B #2 ratio **1.138** (11 rounds, all B slower) | **REVERTED** | A/B #2 ran under contention: a Remotion agent (facecam fix, agent 7218cc23) started 19:13 WIB mid-measurement with ffmpeg at ~135% CPU — that run is contaminated and discarded. A/B #1 alone is a 2.5% lean inside the ±4% noise band, not a proven win; lex is only ~2–4% of CPU, so even a perfect rewrite cannot move the total much. Reverted to the V3 snapshot (kit lex + V1 inline). Lesson: never benchmark while a Remotion agent runs; check `subagent.list` first. |
| 5 | `trimLine()`: manual space/tab scan instead of `/^[ \t]+|[ \t]+$/g` per line; returns the original string when nothing is trimmed (no copy allocated) | A/B vs V3 ratio **1.066** (7 rounds, 6/7 favouring A — B slower) | **REVERTED** | The regex is a single native irregexp scan; my two JS loops cost more per line. Lesson: a lone regex scan beats a hand-rolled JS char loop — manual wins only when it removes calls or allocations (V1, V2, V8), not when it re-implements one scan. |
| 6 | `escapeHtml()`: manual single-pass scan instead of `text.replace(/[&<>"']/g, cb)`; returns the original string untouched when it holds no special character | A/B vs V5 ratio **1.102** (7 rounds, 7/7 favouring A — B slower) | **REVERTED** | Same lesson as V5: the native regex scan beats the JS char loop; the callback only fires on real matches (rare). Restored the kit's regex + ESCAPES table. |
| 7 | `slugify()`: memoize in a module-level Map (pure function; tag names repeat ~20x and were slugified 3–5 times each in `tags()`) | A/B vs V6 ratio **0.942** (7 rounds, 5/7 favouring B); confirmation after the V5/V6 reverts: v8-nomemo vs entry ratio **0.930** (11 rounds, 8/11 favouring B) | **KEPT** | ~7% win, confirmed on the final code. |
| 8 | `parseFrontMatter`: all regexes replaced by manual checks (`isBlank`, `keyValue`, `rtrim`, `dateOf`, `isName`, `isSlug`, `isTag`) | A/B vs V7 ratio **0.819** (7 rounds, 7/7 favouring B) | **KEPT** | ~18% win — the biggest single change after V1. Replacing 4–6 regex calls per line with a few char checks pays; a single regex scan does not (see V5/V6). |
| 9 | Fuse `lex()` + `renderMarkdown()` into one pass (emit each block's HTML as it closes; no token objects, no second pass). List start uses `Number(ordered[1])` so `03.` still renders `start="3"`. | A/B entry vs v9-fusion ratio **1.014** (7 rounds, 3/7 favouring B — noise) | **NOT PROMOTED** | Neutral: token objects were not the bottleneck. Lives in `bench/variants/v9-fusion/` only; entry keeps `lex` + `renderMarkdown`. |

## Final result (2026-11-24 ~20:45 WIB, Remotion idle, 1 CPU pinned, 11 rounds)

Direct A/B, baseline (kit verbatim) vs final entry (V1+V2+V3+V7+V8):

- Baseline median **586.4 ms** (matches the original 584.8 ms measurement — the machine state is consistent)
- Entry median **252.4 ms**
- **Ratio 0.431 — the entry is 2.32x faster than the baseline; all 11 rounds favour the entry** (ratios 0.373–0.460). Far outside the ±4% noise band and the 95% one-sided confidence the heat requires.
- (Cross-check: the product of the individual ratios 0.60 × 0.922 × 0.899 × 0.930 × 0.819 ≈ 0.38 is only a rough estimate — the direct 0.431 is the authoritative number.)

## Differential verification (fresh cases from the kit's own generator)

`bench/difftest.mjs` draws new case sets with `program/generator/draw.ts` under
different seeds (sha256 of `difftest-<label>`), runs the entry's `solve.js` `run()`,
and canonical-compares each answer with the oracle's `expected.json` (same rule as
the scorer; first differing path is printed on failure).

- Seeds s1–s6, 2026-11-24 ~19:25 WIB: **18/18 fresh cases byte-identical** (plus the
  3/3 practice cases). Covers new slug collisions, refusals, unicode titles, draft
  links, and markdown edge mixes the practice set never drew. This validates V1, V2,
  V3 and V5 together on 21 distinct sites.
- V6 checked on seeds s1+s7 (6/6), V7 on s1+s8 (6/6), V8 on s1+s2+s9 (9/9),
  V9-fusion on s1+s2+s3+s10 (12/12). **Total: 51 fresh generated cases, all
  byte-identical**, plus practice 3/3.
- Full re-run on the final entry state (V1+V2+V3+V7+V8, after the V5/V6 reverts),
  seeds s1–s10, 2026-11-24 ~20:50 WIB: **30/30 fresh cases byte-identical**.

## Adversarial fuzz (`bench/fuzz.mjs`, seeded, reproducible)

Random front-matter docs and random Markdown docs (constructs the generator never
draws: unclosed fences, `03.` list starts, 7-hash headings, stray quotes, tab
after colon, `a--b` slugs, leap-day dates) compared kit reference vs entry:

- 2026-11-24 ~20:00 WIB: front-matter **8000/8000 identical**, Markdown **8000/8000
  identical** (seeds fuzz-1, fuzz-2); V9-fusion variant **5000/5000 + 5000/5000**.

## End-to-end driver + determinism (final state, 2026-11-24 ~20:50 WIB)

- Full driver (`main.ts` on practice input) + official scorer: **passed=1, 3/3 cases**
  (`bench/out/final-scores/scores.json`).
- Determinism: two driver runs byte-identical (`bench/out/fdet1` vs `fdet2`).
- Entry files only (solve.js + main.ts + package.json + vendor/ + PERF.md): **65,683
  bytes**, far under the 4 MiB repo limit. (`bench/` holds ~23 MB of scratch —
  variant snapshots, profiles, run outputs, measurement logs — NOT part of the
  entry; the parent pushes only the entry files. The 111 MB of generated difftest
  case sets were deleted after the final run; `bench/difftest.mjs` regenerates them
  from seeds on demand.)

## Measurement notes

- Standalone `bench.mjs` medians drift: V8 tiers up over repeated runs in one process
  (baseline 587 → 466 ms across 7 rounds). **Use `ab.mjs` (interleaved A/B, 7 rounds)
  and the median ratio for decisions**; standalone medians overstate early-run wins.
- V1 standalone 289.5 ms vs A/B 319.0 ms (same code) — the A/B ratio 0.60 is the honest
  steady-state number: entry ≈ 1.67x baseline.
