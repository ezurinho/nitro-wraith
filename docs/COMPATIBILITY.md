# Browser compatibility

## Tested

| Browser | Status | Notes |
| --- | --- | --- |
| Chrome (current stable) | Supported | The browser harness and the visual baselines run here. |
| Microsoft Edge (Chromium) | Supported | Same engine as Chrome; no separate harness job yet. |
| Firefox | Not tested | Tampermonkey works, but the Web Locks, Page Lifecycle and audio behavior can differ. Reports are welcome. |
| Safari / iOS | Not supported | Userscript managers and page lifecycle support are too different. |

The userscript header uses `@match https://www.nitrotype.com/*`,
`@grant none` and `@run-at document-idle`.

## Features the script relies on

| Feature | Used for | If it is missing |
| --- | --- | --- |
| Web Locks | One typing tab at a time | The tab election still works; the lock reports `unsupported` and the script falls back to the lease. |
| Page Lifecycle `freeze` / `resume` | Releasing the lock before a hidden tab is frozen | The freeze counter and the AFK guard see fewer events; typing still stops on `pagehide`. |
| Web Worker timers | Keeping cadence in a hidden AFK tab | Falls back to `setTimeout`, which browsers clamp in the background. |
| `AudioContext` | Optional near-silent keep-alive | The keep-alive reports `blocked`/`n/a`; AFK farming still works with the freeze risk. |
| `color-mix()` | Theme colors | Modern Chromium and Firefox support it; older browsers may lose some tints. |
| Clipboard API | Copy report / support bundle | The JSON is placed in the config box for manual copy. |
| Notifications API | Optional desktop alerts | The toggle reports `n/a`; no alert is sent. |

## Why the harness is Chrome-only

The harness drives Chrome through the DevTools Protocol without dependencies.
A Firefox run needs a different driver and a second set of visual baselines,
because fonts and layout differ. Until that exists, Firefox is explicitly
"not tested" rather than "supported".

## Reporting a Firefox issue

Include:

- Firefox version and Tampermonkey version;
- the panel footer version;
- whether Web Locks shows `free`/`held`/`unsupported` in the diagnostic;
- a redacted support bundle from TUNE → Health → support.

Do not claim Firefox support in a release note until the smoke path (boot,
panel, queue idle, one theme) has been run on it.
