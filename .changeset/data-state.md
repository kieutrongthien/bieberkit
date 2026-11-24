---
'@bieberkit/data': minor
---

Add state machines and sequences under `@bieberkit/data/orm`. `transition` moves a loaded row along a declared transition, checks its input, and adds an outbox event and an audit entry to the unit of work, and `availableTransitions` and `transitionOf` serve the routes. A state is written only by `transition`: the unit of work and the native writes refuse any other change with `DATA_STATE_DIRECT_WRITE`. A `f.sequence` field is numbered by the server inside the saving transaction, gap free per tenant (`nextSequence`, `formatSequence`), from the new framework table `bk_sequences`.
