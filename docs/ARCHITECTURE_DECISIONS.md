# AI Superhub V2 Architecture Decisions

## ADR: Local Workflow Interoperability Over Orchestration

Status: Accepted

AI Superhub V2 uses a lightweight workflow context layer for cross-workspace interoperability. Workspaces exchange typed context packets, not commands to execute and not runtime handles. This preserves deterministic runtime governance while making the workstation feel connected.

## Workflow Interoperability Doctrine

Workspace interoperability is operator-driven:

- Chat may consume attached context packets as bounded system context.
- Coding may receive reusable code snippets from chat or send snippets outward.
- Terminal may send mock command output to chat or save output as a note.
- Image may attach prompt/artifact metadata to chat.
- Diagnostics may attach operational snapshots to chat.
- The Artifacts utility panel may expose recent reusable workflow packets.

The layer does not schedule work, replay tools, execute hidden actions, or infer autonomous next steps.

## Context Packet Governance

Workflow context packets are typed and serializable. Supported packet types are:

- `text`
- `code`
- `terminal-output`
- `tool-result`
- `image-artifact`
- `diagnostics-snapshot`
- `prompt`
- `workspace-note`

Each packet carries source workspace metadata, a creation timestamp, a title, a summary, and a bounded payload. Payloads are clipped before persistence. Blob URLs and data URLs are stripped because they are not restoration-safe.

## Persistence Implications

Workflow context is stored in the existing workstation continuity store. This keeps persistence local-first and avoids another storage authority. Hydration applies the same governance pattern used by command history and workspace continuity:

- schema versioning
- stale state invalidation
- bounded history
- bounded attachment list
- deduplication
- invalid reference cleanup
- corruption recovery

Attached chat context is restored only as visible, removable references. It never restores active streams or execution state.

## Interoperability Constraints

The workflow layer must not share:

- sockets
- streams
- AbortControllers
- File objects
- media objects
- live provider handles
- giant payloads
- hidden execution intents

Cross-workspace actions must remain small and predictable. A button may move a snippet, output, prompt, artifact metadata, or diagnostics snapshot, but it must not start an autonomous workflow.

## ARM64 Rendering Considerations

Workflow UI is intentionally compact: chips in the composer and small artifact cards in the utility panel. History and attachment lists are capped. Context formatting happens at send time rather than continuously. This limits rerender pressure and avoids large serialized trees.

## Deferred Autonomy

Agentic workflows, macro replay, browser automation, workflow graphs, and orchestration frameworks remain out of scope. Future autonomy can integrate at explicit, documented boundaries only after local workflow interoperability is stable and observable.
