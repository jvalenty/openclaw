# Replit Deploy Process - Lessons Learned

**Created:** 2026-02-01

## Standard Deploy Flow

1. **Commit & push locally** (from `~/clawd/stellabot-replit`)
   ```bash
   git add -A && git commit -m "message" && git push
   ```

2. **In Replit browser** (profile=clawd):
   - Navigate to: `https://replit.com/t/killerapps/repls/Stellabot`
   - Click **Git** tab (or it may already be visible in bottom panel)
   - Click **Fetch** button to get latest from GitHub
   - If prompted for GitHub credentials, click **"Confirm for this session"**
   - Click **Pull** (inside "Sync Changes X" dropdown)
   - Click **Republish** (top-right button or in Publishing tab)

3. **If database migrations detected**:
   - Replit shows "Database migrations validated successfully"
   - Click **"Approve and publish"** to proceed
   - Wait for deploy stages: Provision → Security Scan → Build → Bundle → Promote

4. **Verify deploy**: Check Publishing tab shows "Stella published X minutes ago"

## DOM/UI Tips for Browser Automation

- **Git tab elements**: Fetch (e93), Pull (e95), Sync Changes button (e94)
- **Republish button**: Usually e10 at top, or e284/e285 in Publishing panel
- **Credential dialog**: Look for "Pass GitHub Credentials" dialog, confirm with e4
- **Deploy status**: Look for "Publishing Started..." or "Stella published X ago"

## Common Issues

### 404 on production after deploy
- Check if routes changed but redirects weren't updated
- Example: Routes refactored from `/admin/dashboard` → `/dashboard` but Home.tsx still redirected to `/admin`
- Fix: grep for old route references and update them

### Elements not found
- Replit UI is dynamic - always take fresh snapshot before clicking
- Wait 2-3 seconds after major actions (Fetch, Pull, page loads)

### Browser timeout
- Use shorter waits (3-5 seconds) instead of long waits
- Check browser control server is running if timeout errors

## Critical Pre-Deploy Checklist

- [ ] `git pull` locally to ensure no conflicts
- [ ] Verify routes match across all files
- [ ] Test on dev environment first if possible
- [ ] For breaking changes, deploy during low-traffic times

## Key Files to Watch

- `client/src/pages/Home.tsx` - login redirects
- `client/src/App.tsx` - route definitions
- `server/routes/*.ts` - API endpoints
