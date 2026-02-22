# Stellabot Fly.io Migration - 2026-02-01/02

## Summary
Successfully migrated Stellabot from Replit to Fly.io to fix WebSocket 400 errors. The root cause was Replit's proxy not properly handling WebSocket upgrades.

## What Was Done

### 1. Fly.io Setup
- Created `stellabot-app` on Fly.io under `killerapps-dev` org
- Added payment method at org level (required for deployment)
- Created Dockerfile for Node.js app (multi-stage build)
- Created `.dockerignore` to speed up deploys
- Set up secrets:
  - DATABASE_URL (Neon postgres)
  - PGHOST, PGPORT, PGDATABASE, PGUSER (individual PG vars)
  - SESSION_SECRET
  - DOMAIN, BASE_URL
  - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (OAuth)

### 2. WebSocket 400 Error - Root Cause & Fix

**Problem:** WebSocket connections to `/ws/machines` returned 400 Bad Request even though the server was running correctly.

**Root Cause:** Multiple `WebSocketServer` instances attached to the same `httpServer` were conflicting. When one WS server's `verifyClient` returned false (because path didn't match), it would send a 400 before the correct handler could process the request.

**Solution:** Changed `machineWebSocket` to use `noServer: true` mode and manually handle upgrade events:

```typescript
// Before (conflicting):
this.wss = new WebSocketServer({
  server: httpServer,
  path,
  verifyClient: ...
});

// After (working):
this.wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  
  if (pathname === path) {
    // Verify token before upgrading
    const token = this.extractToken(request);
    if (!token || !token.startsWith('e2e_')) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    
    this.wss!.handleUpgrade(request, socket, head, (ws) => {
      this.wss!.emit('connection', ws, request);
    });
  }
  // Don't handle other paths - let other handlers deal with them
});
```

**Key insight:** With `noServer: true`, the WebSocket server doesn't attach its own upgrade handler. We manually check the path and only call `handleUpgrade` for matching paths. Other paths are completely ignored, allowing other WebSocket servers to handle them.

### 3. Other Fixes Applied

- **trust proxy:** Added `app.set('trust proxy', true)` for Fly.io's reverse proxy
- **Static file handler:** Added `/ws` and `/secure-ws` to skip list to prevent catching WebSocket paths
- **Initialization order:** Machine WebSocket now initializes FIRST before other WS servers

### 4. Files Modified

- `server/index.ts` - WebSocket initialization order, trust proxy
- `server/machines/websocket-handler.ts` - noServer mode, manual upgrade handling
- `server/static.ts` - Skip WebSocket paths
- `fly.toml` - Fly.io config
- `Dockerfile` - Container build
- `.dockerignore` - Exclude node_modules from context

## Deployment URLs

- **Production (Fly.io):** https://stellabot-app.fly.dev
- **Test WS Server:** https://ws-test-ka.fly.dev (simple test, can be deleted)

## Remaining Tasks

1. **DNS Migration:** Point stellabot.app to Fly.io (John to handle)
2. **Update Google OAuth:** Add stellabot.app redirect URI
3. **Test with real machine tokens:** Current tests use fake `e2e_test_machine` token
4. **Clean up test app:** Delete `ws-test-ka` when no longer needed
5. **Commit changes to GitHub:** Push the WebSocket fixes

## Debugging Timeline

1. Initial deploy - DB connection errors (localhost instead of Neon)
2. Fixed DATABASE_URL - app runs but WebSocket returns 400
3. Confirmed test WS server works on Fly.io - isolated to Stellabot
4. Found `/secure-ws` returns 101 but `/ws/machines` returns 400
5. Disabled other WS servers - machineWebSocket works alone!
6. Root cause: Multiple WS servers conflicting
7. Fix: noServer mode with manual upgrade handling
8. All WS servers now coexist properly

## Lessons Learned

1. **Multiple WebSocketServer instances on same httpServer can conflict** - use `noServer: true` for precise control
2. **Fly.io requires payment at org level** - not just account level
3. **Neon DB is external to Replit** - can connect from anywhere, no migration needed
4. **WebSocket upgrade events fire before Express middleware** - but WS server's internal handling can still conflict
5. **Debug WebSocket issues with verbose logging** - track upgrade event, verifyClient, and connection event separately
