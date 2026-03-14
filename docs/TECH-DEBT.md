
## Work Queue / WorkProcessor (2026-02-13)

**Location:** `server/workers/work-processor.ts`, `shared/models/conversation.ts` (work_queue table)

**Status:** Commented out / disabled in `server/index.ts`

**Why disabled:** Over-engineered. Built a full background worker queue system when the simpler solution is to use chat history as the checkpoint. Agents persist their progress to chat messages, which are already in the DB. On resume, agent reads its own history and continues.

**Cleanup needed:**
- [ ] Remove `work_queue` table and migration
- [ ] Remove `server/workers/work-processor.ts`
- [ ] Remove work queue references from `shared/models/conversation.ts`
- [ ] Remove commented imports from `server/index.ts`

**Keep for reference:** The conversation state and rolling summary patterns in `conversation.ts` may still be useful.
