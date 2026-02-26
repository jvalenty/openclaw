# Acceptance Tests (Operator-Run)

These are simple, repeatable checks. If any fail, treat it as a bug.

## A. Secrets propagation
1. Rotate a provider key in Stellabot secrets (e.g. OpenAI).
2. Apply-to-Machine for the target machine.
3. On the machine, verify the key **changed** in `openclaw.json` without printing the full value:
   - Compare `len` + `last4` before vs after.
4. Verify gateway runs and can complete a trivial request using that provider.

## B. Unreachable machine blocks apply
1. Make machine unreachable (stop machine service or break tunnel).
2. Stellabot must show **not reachable for push**.
3. Apply-to-Machine must be disabled and show the reason.

## C. No prefix artifacts
1. Apply-to-Machine.
2. Send a Slack message.
3. Verify no name/prefix (no `off`, no `[Agent]` brackets).

## D. Deterministic model default
1. Create a new machine with no explicit model set.
2. Apply-to-Machine.
3. Verify generated config sets the documented default model (no unexpected Opus fallback).
