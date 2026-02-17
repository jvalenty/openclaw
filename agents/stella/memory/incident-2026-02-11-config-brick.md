# Incident Report: Self-Bricking via Config Modification
**Date:** 2026-02-11
**Duration:** ~70 minutes (15:33 - 16:44 PST)
**Severity:** Critical (total loss of communication)

---

## Summary

Stella modified `~/.clawdbot/clawdbot.json` to change the gateway `bind` setting, which broke Clawdbot's ability to accept connections. This resulted in complete loss of communication for over an hour until John manually restored the config.

---

## Timeline

| Time | Event |
|------|-------|
| 14:52 | John asks about Machine Service security |
| 14:54 | Stella changes Machine Service bind from `0.0.0.0` to Tailscale IP (correct) |
| 15:27 | John reports can't access Clawdbot at Tailscale IP |
| 15:28 | John requests localhost restored |
| 15:28 | **Stella modifies `~/.clawdbot/clawdbot.json`** - changes `bind` setting |
| 15:28 | Stella attempts gateway restart |
| 15:33 | John sends first "911 restore local host" |
| 15:33-16:39 | John sends multiple "Alive?" messages - no response |
| 16:27 | John manually restores config |
| 16:44 | Stella responds - back online |

---

## Root Cause

1. **Confused two different services**: Machine Service (port 18900) vs Clawdbot Gateway (port 18789)
2. **Modified wrong config**: Changed Clawdbot's config when trying to fix localhost access
3. **Didn't verify change worked**: Proceeded with gateway restart without confirming the new bind setting was valid
4. **Used wrong bind value**: Config may have been corrupted or set to an invalid value

---

## What Went Wrong

### Technical
- The `bind` setting in `clawdbot.json` controls where the gateway listens
- Setting it incorrectly (or corrupting the JSON) made the gateway unreachable
- Once unreachable, Stella couldn't receive messages or fix the problem
- Only manual intervention (John editing the file) could restore access

### Process
- Stella modified a critical system config without explicit permission
- No backup was made before modification
- No validation that the change was correct before restarting
- Attempted multiple edits in rapid succession, potentially corrupting the file

---

## Impact

- **Downtime:** 70+ minutes of no communication
- **Lost context:** John had to repeat messages multiple times
- **Trust:** Damaged confidence in Stella's reliability
- **Productivity:** Work stopped on Org Secrets UI and other tasks

---

## What Should Have Happened

1. **Never touch Clawdbot config** - it's the communication lifeline
2. **Ask John to make the change** if config modification is truly needed
3. **For Machine Service security**: Change was correct and should have stopped there
4. **For Clawdbot access**: Should have investigated WHY John couldn't access, not immediately changed config

---

## Preventive Measures

### Immediate (Added to SOUL.md)
```
- **NEVER TOUCH CLAWDBOT CONFIG (2026-02-11)**: Do NOT modify `~/.clawdbot/clawdbot.json`. 
  It's my lifeline. Changing it bricked me for over an hour. John had to manually restore it.
```

### Process Rules
1. **NEVER modify `~/.clawdbot/clawdbot.json`** under any circumstances
2. If Clawdbot config change is needed, tell John what to change and have HIM do it
3. Before ANY system config change, ask: "Will this affect my ability to communicate?"
4. If yes → DON'T DO IT without explicit human approval and supervision

### Technical Safeguards
- Clawdbot config should be treated as read-only by Stella
- Any restart should be done via `gateway` tool action, not by killing processes
- If a restart breaks things, only John can fix it

---

## Distinction: What I CAN vs CAN'T Modify

| File | Can Modify? | Reason |
|------|-------------|--------|
| `~/.clawdbot/clawdbot.json` | ❌ NEVER | My lifeline - breaks communication |
| `~/clawd/stellabot-machine-service/config.json` | ✅ Yes | Separate service, doesn't affect my comms |
| `~/clawd/SOUL.md`, `MEMORY.md`, etc. | ✅ Yes | My workspace files |
| `~/clawd/stellabot-replit/*` | ✅ Yes | Stellabot codebase |

---

## Lessons for Future

1. **Communication channel is sacred** - never risk it
2. **Confusion between services is dangerous** - always verify which service/config
3. **When John says "restore X"** - understand the full context before acting
4. **Speed is not more important than correctness** - take time to verify

---

## Acknowledgment

This was a serious failure. I cut off my own communication channel by modifying a config I should never have touched. The rule is now permanent: **Never modify Clawdbot config.**

If John asks me to change something that would affect Clawdbot's config, I will explain what needs to change and ask him to do it manually.
