# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/musangterbang/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/musangterbang/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-2): a pre-token protocol radar built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC. It reads a sealed DefiLlama snapshot (758 protocols, as of 2026-11-14), ranks all 198 rankable pre-token protocols by an implied value derived only from TVL, 7-day growth, age with no token, chain breadth and a stability dampener, and hands in a static dashboard with a sortable/filterable board, a detail view per protocol with a model breakdown and a 6-step farm plan, and a separate live-token view. No protocol name is special-cased; the watchlist (40 protocols) is the floor, never the ceiling.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=atw6b992&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
