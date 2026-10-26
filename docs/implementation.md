# Model Breakdown: implementation map

[← Project](../README.md) · [Current browser source](../studio/) · [Source versions](source-versions.md)

| Responsibility | Inspect | Engineering concern |
| --- | --- | --- |
| Real example delivery | [example-models.ts](../studio/app/example-models.ts) | Gzip delivery must retain GLB bytes and named mesh parts; validate before replacing the current model |
| Import and scene inspection | [page.tsx](../studio/app/page.tsx) | Load geometry, expose available parts, preserve the intended orientation and handle unsupported inputs |
| Exploded layout | [explode-layout.ts](../studio/app/explode-layout.ts) | Solve from the assembled pose, handle nested transforms and keep the composition inside the safe frame |
| Emphasis and timing | [page.tsx](../studio/app/page.tsx) | Component selection, layout keys and reveals represent the creator's explanation |
| Output | [page.tsx](../studio/app/page.tsx) | Review dimensions, frame timing and continuous encoded motion; codec success alone is insufficient |
| Focused tests | [tests/](../studio/tests/) | Named-part geometry integrity, units, projection, nested parent transforms and drift |

The current client is a substantial single-page prototype with an extracted layout solver and example loader. A production handoff should further separate import/state, render composition, timeline evaluation and encode IO. Automatic semantic grouping, a general undo/version system and broad import compatibility are not established capabilities.

AI-assisted code development produced the prototype; it does not mean the running app contains a language-model agent. The creator retains the meaning of the explanation and final acceptance.
