# Dan Training Mission - ACTIVE

**Status:** IN PROGRESS  
**Started:** 2026-02-10 ~7:00 PM PST  
**Objective:** Dan must be 100% ready for brand manager duties by morning  
**Owner:** Stella (continue until complete, even across context resets)

---

## Mission Context

John requested intensive training for Dan, the Brand Manager agent. Dan needs to independently:
1. Navigate Earnware CMS (app.earnware.ai)
2. Read and analyze feed content
3. Review and manage pub orders
4. Check planner schedules
5. Verify ESP campaigns (dashboard.earnware.com)
6. Use Google Sheets for brand management data

## Dan's Configuration

**Agent ID:** `26187726-399c-430f-a85d-f5fb9f59cdbe`  
**Org:** AMG (`fb6ec0c9-9b00-40d5-b3aa-e636626ff98e`)  
**Type:** Soft agent (runs via Claude API in Stellabot)

### Permissions (agent_actions table)
- `browser.interact` - Click, type, scroll
- `browser.navigate` - Navigate URLs  
- `clawdbot` - Hardware proxy to Mac Mini
- `google` - Google Sheets API

### Skills
- **brand-manager** (ID: `284ab75e-d1c8-4929-b65c-86ef0da36ed0`) - Assigned via owner_id

### System Prompt
Updated 2026-02-10 ~7:30 PM with:
- Clear tool usage instructions
- "CRITICAL: Complete Every Task" rules
- Key URLs for Earnware
- Reference to brand-manager skill

---

## Issues Identified & Fixed

### 1. Skill Not Loading
- **Problem:** brand-manager skill wasn't being injected into Dan's context
- **Cause:** Skills match by `owner_id = agent.id` OR `name = agent_slug`. Dan's slug is "dan", skill named "brand-manager"
- **Fix:** Set skill's owner_id to Dan's agent ID
- **Status:** ✅ FIXED

### 2. Narrating Instead of Executing
- **Problem:** Dan would say "Let me take a snapshot..." without actually executing tools
- **Cause:** Model confusion about tool execution vs describing intent
- **Fix:** Updated system prompt with explicit execution requirements
- **Status:** ✅ FIXED (needs verification)

### 3. Wrong Browser Tab
- **Problem:** Dan was snapshotting Stellabot tab instead of Earnware
- **Cause:** Multiple tabs open, default snapshot hits wrong one
- **Fix:** Must use browser_navigate to specific URL first
- **Status:** ✅ Taught to Dan, needs verification

---

## Test Results

| Time | Test | Result |
|------|------|--------|
| 7:26 PM | Read pub order #378218 data | ✅ PASSED (with guidance) |
| 7:35 PM | Status bar + featured image question | ✅ PASSED - Correctly identified "Pending" status and featured image with alt text |
| 7:38 PM | Feeds page navigation + content analysis | ⏳ PENDING |

---

## Verification Checklist

Dan must demonstrate these capabilities INDEPENDENTLY (no hand-holding):

### Browser Navigation
- [ ] Navigate to app.earnware.ai/content/feeds
- [ ] Take snapshot and read actual headlines
- [ ] Navigate to app.earnware.ai/pub-orders
- [ ] Open a specific pub order and read all fields

### Feed Analysis
- [ ] Identify stories from last 8 hours
- [ ] Evaluate engagement potential
- [ ] Provide specific headlines (not placeholders)

### Pub Order Management
- [ ] Read order status from progress bar
- [ ] Identify brand, headline, QA score
- [ ] Check if featured image is selected
- [ ] Read planner link details

### Planner Review
- [ ] Navigate to planner page
- [ ] Read scheduled slots and times
- [ ] Identify which brands are scheduled

### Google Sheets
- [ ] Read from Brand Management sheet
- [ ] Understand sheet structure

---

## Current Test (7:33 PM)

**Question sent to Dan:**
> @Dan Quick test - take a browser_snapshot of the current page (pub order #378218) and tell me: 1) What status is this order in (look at the progress bar), 2) Does it have a featured image selected?

**Expected answer:**
1. Status: "Pending" (first step in progress bar is active)
2. Featured image: YES - "Wall-mounted guns displayed in a store."

---

## How to Resume This Mission

If context is lost, read this file and:

1. Check HEARTBEAT.md for current status
2. Go to Stellabot group thread "Brand Managers" 
3. Review Dan's last response
4. Continue testing from verification checklist
5. Don't stop until ALL items are checked off

**Group Thread URL:** https://stellabot.app (click Brand Managers in chat panel)

**Browser state:** Earnware pub order #378218 should still be open in clawd profile

---

## Training Approach

1. Ask specific, answerable questions
2. Require Dan to use tools and report ACTUAL data (not placeholders)
3. If Dan spins or asks for help, coach him directly
4. Verify each capability before marking complete
5. Document results in this file

---

## Success Criteria

Dan is "100% ready" when:
1. All verification checklist items are ✅
2. Dan can complete a full workflow without asking for help
3. Dan reads actual data (not "[placeholder text]")
4. Dan executes tools instead of narrating intent
