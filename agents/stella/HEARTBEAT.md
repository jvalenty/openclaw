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
- [x] **A: Secrets propagation** — Apply-to-Machine verified end-to-end on both machines (2026-02-26). New keys active: Stella last4=GwAA, Bella last4=B0l3
- [x] **B: Unreachable blocks apply** — Apply button disabled when "Could not reach machine"; server returns 503 (deployed e3b03eb)
- [x] **C: No prefix artifacts** — `responsePrefix: ""` applied to both machines; no brackets in Slack messages (2026-02-26)
- [ ] **D: Deterministic model default** — Sonnet fallback fixed server-side (line 197), client default also fixed (line 163). Not formally tested with blank machine yet.

## Blocking Issues (Current Reality - 2026-03-02)
1. **Stellabot Deployment Approval (Secret Injection)** — Bella has successfully pushed the `SecretRef` integration to `origin/bella/openclaw-secretref-exec-provider`. It is ready for review. I am delegating deployment to you because of the hard rule: **"Never deploy to prod without John's approval."**
2. **Key Rotation (Incident Response)** — The Anthropic, OpenAI, Google, and Brave keys exposed during my debug session leak must be manually rotated and updated in Stellabot by you. I am delegating this because of the hard rule: **"Never echo secrets / I CANNOT safely handle secrets through any tool."** 
3. **ElevenLabs key rotation** — John's action item (keys exposed in session context 2026-02-26).

## 🎯 TRADEBLADE — P6 Backtest Confidence Infra
All 10 pages live at https://tradeblade-app.fly.dev
**SKIP live session until backtest confidence is established (John's directive 2026-02-25)**

## ✅ SecretRef Apply — BOTH MACHINES DONE (2026-03-03)
- Stella ✅ Applied + healthy
- Bella ✅ Applied + healthy (gateway up, Slack + Telegram OK)
- Both on OpenClaw 2026.3.2
- Anthropic baseUrl fix deployed (no `/v1` — client appends it)