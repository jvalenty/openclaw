# HEARTBEAT.md

## ⚠️ Polygon .env Update Needed
John rotated key + updated Fly secret ✅. Local .env still has old key.
Key is in 1PW. `op` CLI hung (needs desktop app unlock). John can DM or unlock 1PW on Mac mini.
After update: `sed -i '' 's/POLYGON_API_KEY=.*/POLYGON_API_KEY=<NEW>/' ~/tradeblade/.env` + restart tmux `tradeblade`

## 🏗️ CONTRACT-FIRST MODE (2026-02-26)
John is frustrated. We've been doing theater. Switching to invariants + acceptance tests.
Docs: `~/openclaw/docs/invariants.md` + `~/openclaw/docs/acceptance-tests.md`
**Rule: No code/config changes without a diff + reasoning + approval.**

## Acceptance Test Status
- [ ] **A: Secrets propagation** — Apply-to-Machine not yet verified end-to-end (needs machine reachable for push)
- [ ] **B: Unreachable blocks apply** — UI currently allows Apply-to-Machine even when machine isn't reachable for push (bug in Stellabot UI)
- [ ] **C: No prefix artifacts** — template fixed (`responsePrefix: ""`), not yet verified on Bella
- [ ] **D: Deterministic model default** — Sonnet fallback fixed, not yet verified

## Blocking Issues
1. **Stellabot doesn't distinguish "heartbeat online" from "reachable for push"** — state model bug
2. **Bella's machine offline/unreachable** — Machine Service + heartbeat not set up on her end
3. **ElevenLabs key rotation** — John's action item

## 🎯 TRADEBLADE — P6 Backtest Confidence Infra (in progress)
All 10 pages live at https://tradeblade-app.fly.dev
**SKIP live session until backtest confidence is established (John's directive 2026-02-25)**

**Done today:**
- ✅ ORB market-open anchor bug FIXED (prior backtest results invalid — all re-runs needed)
- ✅ market_bars (lazy cache), backtest_trades, backtest_equity_points tables live
- ✅ /runs/:id/trades + /runs/:id/equity read endpoints
- ✅ Equity curve chart (Recharts) + trade log table in UI (backtest expanded view)

**P6 DONE (UI side):**
- ✅ engine_version baked into Docker builds via deploy.sh
- ✅ Walk-forward UI built — windows table (IS vs OOS), stability scores, OOS summary
- ✅ Param sweep UI built — CSS heatmap + ranked results table

**P6 COMPLETE + HARDENED ✅**
All endpoints + UI live. Migration hardened: one-statement-per-execute (Neon compat), startup verification, fatal on failure.

**Latest P6 commits:**
b250867 (Math.round volume for bigint) → 375cea7 (migration hardening) → 3654964 (migration fix) → d4c986b (WF + sweep backend) → a803822 (WF + sweep UI)

**✅ E2E CONFIRMED (2026-02-25 ~22:50 PST):**
TSLA ORB Jan 26→Feb 24 $50k: 2 trades, +5.51%, sharpe 1.81. Trades+equity endpoints 200.
John wakes up and can test — app is working.

**NEXT: P7 or auto-tune loop** — agent reviews backtest report, tweaks params, reruns. Decision for John.

## 🎯 ACTIVE: Reseller Architecture / Stellabot
See HEARTBEAT sections below for ongoing Stellabot work...

---

## 🎯 ACTIVE: Reseller Architecture

**Status:** Phase 5 complete (Machine Service auth middleware)  
See ~/clawd/docs/specs/ for full specs.

## 🎯 ACTIVE: Agent SOP & Progressive Heartbeat

**Status:** Phase 1 deployed, Phase 2 pending  
See ~/e2e/stellabot/docs/specs/agent-sop-progressive-heartbeat.md

## 🎯 NEXT: Cost Controls (Stripe)
- ⏳ Phase 5: Stripe checkout/webhooks
- ⏳ Phase 7: Email notifications at 80%/degraded
