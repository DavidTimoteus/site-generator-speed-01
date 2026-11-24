# site-generator-speed-01

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/DavidTimoteus/site-generator-speed-01/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/DavidTimoteus/site-generator-speed-01/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in replacement for make.fun's makefun-site 1.0.0 static site generator, built for [make.fun](https://make.fun/bounty/site-generator-speed-01-run-20261122)'s **site-generator-speed-01** bounty ($100 USDC). Same output tree byte for byte, ~2x less CPU.

## Run

```sh
node main.ts
```

It reads `/input/cases.json` and writes `/output/answers.json` (outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for those paths). See PERF.md for the optimization ledger: bulk escaping, manual word scan, card reuse, slug memoization, and a hand-rolled front-matter parser — every kept change verified byte-identical on all practice cases, 30 fresh generated cases, and 16,000+ adversarial fuzz documents.
