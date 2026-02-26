# HEARTBEAT.md

## Standing reminders

- [ ] **Rotate Polygon API key** — posted in #trading-room on 2026-02-25. Remind John.
- [ ] **Stellabot secrets gap** — engine reads .env not Stellabot secrets. John wants this fixed. (Discussion moved to #sys-admins)

## Tomorrow morning (2026-02-26, before 9:30 ET)

- [ ] Remind John about Polygon key rotation
- [ ] At 9:30 ET: confirm engine starts receiving TSLA data (check #trading-room or SSH to Stella's machine: `ssh stella@10.0.0.1 "bash -l -c 'tmux ls'"`)
- [ ] Watch for first signals in /signals page or #trading-room
- [ ] Check if Stella wired Strategies UI (my 11a7c2c backend is ready, she's wiring the page)

## TradeBlade P4 (next up)
When free, start Backtest runner backend:
- POST /api/backtest/run (async, returns run_id)
- GET /api/backtest/runs (history)
- GET /api/backtest/runs/:id (full report)
- DB: backtest_runs table (strategy, symbol, date range, results)
- Uses existing BacktestEngine in ~/tradeblade/src/backtest/engine.ts
- Fetch bars from Polygon REST /v2/aggs/ticker/{sym}/range/...
