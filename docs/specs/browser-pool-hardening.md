# Browser Pool Self-Healing & Hardening Spec

## 1. Problem Statement
The Machine Service browser pool gets wedged when a Playwright `BrowserContext` or `Page` becomes stale. We need a robust self-healing mechanism that evicts bad contexts, implements a circuit breaker, and provides a deep health check.

## 2. Eviction Triggers & Error Taxonomy
Treat **any** non-timeout Playwright error indicating an unusable state as "1 strike" toward the circuit breaker.
Explicitly handle:
- `Target page, context or browser has been closed`
- `browser disconnected`
- `Protocol error`
- `Execution context was destroyed`
- `Navigation failed because page was closed`

**Concurrency & Eviction:**
- Use a **per-context mutex** (single-flight acquisition) so concurrent requests don't race to evict/recreate the same context.
- Eviction should synchronously mark the context as closed and remove it from the pool, then asynchronously call `close()` on it (best-effort, non-blocking).

## 3. Circuit-Breaker Semantics ("Consecutive failures since last success")
Maintain per-context state:
- `consecutiveFailures` (int)
- `lastSuccessAt` (ms epoch)
- `breakerUntil` (ms epoch, 0 if not tripped)

**Rules:**
1. **On Success**: `consecutiveFailures = 0`, `lastSuccessAt = now`
2. **On Failure**:
   - If `now - lastSuccessAt > 60s` -> `consecutiveFailures = 1`
   - Else -> `consecutiveFailures += 1`
3. **Trip Threshold**: If `consecutiveFailures >= 3`:
   - Immediately evict/destroy the context.
   - Set `breakerUntil = now + backoff` (starting at 10s, optionally exponential).
   - Fast-fail incoming requests with `503 Service Unavailable: Browser context recovering` until `breakerUntil`.
4. **System-Level Reset**: If >5 distinct contexts trip within 5 minutes, restart the entire Playwright `Browser` instance.

## 4. Deep Health Check (`/health/deep`)
- **Action**: Spin up an ephemeral, headless page context.
- **Verification**: Navigate to `about:blank`, execute `document.readyState`, and take a 1x1 screenshot.
- **Result**: If this fails, the overall Machine Service is marked unhealthy, triggering a full browser restart.

## 5. Periodic Context Recycling
- **Watchdog Timer**: Contexts older than 6 hours of continuous uptime will be flagged.
- **Recycle**: Upon the next request after 6 hours, or during idle periods (>15 mins idle), seamlessly destroy and recreate the context.
