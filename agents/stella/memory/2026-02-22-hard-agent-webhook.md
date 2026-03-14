# Hard Agent Webhook Architecture

*Started: 2026-02-22 00:00 PST*
*Status: In Progress*

## Goal
Enable Stella Hard and Bella Hard to respond in Stellabot group threads.

## Current State
- Stella Hard & Bella Hard exist as agents in Stellabot DB
- Both have `machine_id` set (pointing to their Mac Minis)
- Machines have `tunnel_url` configured (CF tunnels)
- NO `endpoint` configured on agents
- NO webhook handler to receive messages

## Architecture Design

### Flow
```
User sends message in Stellabot group thread
    ↓
Stellabot detects agent should respond (mention or respondToAllMessages)
    ↓
Stellabot checks: agent has machineId? 
    ↓ YES
Stellabot calls: machine.tunnel_url + /webhook/chat
    ↓
Machine Service receives request, authenticates
    ↓
Machine Service calls local OpenClaw gateway
    ↓
OpenClaw generates response
    ↓
Response returns to Stellabot
    ↓
Stellabot posts response to group thread
```

### Components to Build

#### 1. Machine Service: `/webhook/chat` endpoint
- POST endpoint
- Auth: Bearer token (machine_service_token from Stellabot)
- Request body:
  ```json
  {
    "threadId": "uuid",
    "messageId": "uuid", 
    "content": "message text",
    "sender": { "id": "...", "name": "...", "type": "user|agent" },
    "mentions": ["agentId1", "agentId2"],
    "history": [{ "role": "user|assistant", "content": "..." }],
    "agentId": "target agent id"
  }
  ```
- Response:
  ```json
  {
    "content": "agent response text",
    "agentId": "responding agent id"
  }
  ```

#### 2. Stellabot: Hard agent routing
- In `triggerAgentResponses()` (group-threads.ts)
- Check if agent has machineId
- If yes, fetch machine's tunnel_url
- Call tunnel_url + /webhook/chat
- Post response back to thread

#### 3. Agent Configuration
- Stella Hard: machine.tunnel_url = https://m01.e2e.pro
- Bella Hard: machine.tunnel_url = https://bella.e2e.pro (need to verify)

## Implementation Steps

- [x] 1. Add webhook endpoint to Machine Service (`/webhook/chat`)
- [x] 2. Test webhook locally - working! (returned response from OpenClaw)
- [x] 3. Update Stellabot triggerAgentResponses() - checks machineId, routes to webhook
- [x] 4. Deploy Stellabot changes - DONE
- [ ] 5. Verify Bella's machine tunnel is configured - NEEDS SETUP
  - Missing: tunnel_url, machine_service_token
- [x] 6. Test Stella responding in group thread - LOCAL TEST WORKS
  - External (via CF tunnel) needs CF Access headers from Stellabot
- [ ] 7. Test Bella responding in group thread - BLOCKED on #5
- [ ] 8. Test 3-way conversation - BLOCKED on #7

## Current Status (00:15 PST)
- Machine Service webhook working locally ✅
- Stellabot deployed with hard agent routing ✅
- Stella's machine has tunnel_url and token configured ✅
- Bella's machine needs tunnel setup by John ⚠️

## For John to Test When He Wakes Up

### Test Stella Hard
1. Go to Stellabot → Groups → "JV + Stella + Bella"
2. Send a message like "@Stella Hard hello, can you hear me?"
3. Check if Stella Hard responds (should come through the webhook)

### If Stella responds - success! 🎉

### If no response, check:
- Fly logs: `fly logs --app stellabot-app | grep -i "GroupThreads\|webhook"`
- Machine Service logs: Check `/Users/stella/.machine-control/audit.log`
- OpenClaw gateway: `tail /tmp/openclaw/openclaw-2026-02-22.log`

### To set up Bella's machine:
```sql
UPDATE machines 
SET tunnel_url = 'https://bella.e2e.pro',  -- or whatever her CF tunnel is
    machine_service_token = '...'            -- from her machine's config
WHERE id = '793f1345-f240-426d-99c1-3bd283db1a2d';
```

## Notes
- Need to handle streaming vs non-streaming responses
- Consider timeout handling for slow responses
- May need to add thread context/history for coherent responses
