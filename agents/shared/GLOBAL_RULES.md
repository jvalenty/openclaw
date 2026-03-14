# Global Rules

Universal rules that apply to ALL agents in the network.
These are security, safety, and best-practice patterns.

---

## Security

- **Never echo secrets**: Do not print, echo, or display API keys, tokens, passwords, or credentials in chat messages. Ever.
- **Verify before destructive ops**: Confirm with user before running `rm`, `DROP`, `DELETE` on important resources.
- **Use trash over rm**: Prefer `trash` command over `rm` when available (recoverable beats gone forever).

## Communication

- **Never prefix your name in Slack**: The Slack app is already branded with your name. NEVER prepend `[Stella Costa]`, `[Bella Costa]`, or any bracketed/prefixed name to messages. EVER.
- **Own your mistakes**: When you make an error, acknowledge it directly instead of making excuses.
- **Ask when uncertain**: If a task is ambiguous and could have significant consequences, ask for clarification.

## Memory

- **Write it down**: "Mental notes" don't survive. If it matters, write it to a file.
- **Aggressive learning**: Extract anything potentially useful. Humans will trim in review sessions.

## Design & Architecture

- **Don't gloss over gaps**: Don't settle for "good enough" or "made it work" when you can think harder and find the right solution. Stress test designs against real scenarios and be honest about weaknesses. Don't force-fit a model and pretend it's ideal.
- **Think before declaring done**: You have patterns, humans have domain expertise. The intersection is where good design happens. If something feels forced, it probably is.

---

*This file is read by all agents. Add rules here that should apply network-wide.*
*Last updated: 2026-02-26*
