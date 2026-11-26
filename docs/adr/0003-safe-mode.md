# 0003 — Stop in safe mode instead of guessing

## Context

An internal error or a game UI change used to leave the loop pressing keys or
clicking buttons that no longer existed. A wrong key during a live race costs a
disqualification; a blind click can start a race the user did not want.

## Decision

- A runtime error while a race is live, or three errors in 30 seconds, enters
  safe mode: release the typing lock, stop the queue, show a banner with
  **resume** and **copy report**.
- Three boot failures in ten minutes persist safe mode across reloads.
- `typingContract()` is checked while a race is live. If the typing component
  disappears, the loop records `ui-drift` and stops.
- `supportBundle()` exports a redacted diagnostic (no token, account name or
  identifier) so a report can be triaged without a console.

## Consequences

- A broken game update becomes a visible stop, not silent wrong input.
- The user must resume explicitly; the script never clears safe mode by itself.
- A false positive costs a paused session, which is cheaper than a DQ.
