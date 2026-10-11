# Current vs Target Reconciliation Rules

Use these categories later when the coding agent compares the existing frontend with this target-design archive:

- **Exists in both** — supported by current implementation and target design evidence.
- **Current-only** — exists in the implementation but no corresponding supplied target reference exists.
- **Target-only** — appears in supplied target references but not in current implementation.
- **Changed** — exists in both, but presentation, structure, state, or behavior differs materially.
- **Needs Verification** — evidence is missing, ambiguous, or conflicting.

Rules:
- Current-only does not mean obsolete.
- Target-only does not mean unsupported.
- Missing Figma evidence is not an instruction to remove current behavior.
- Do not use the current codebase to infer target visuals.
- Do not invent backend/API contracts from screenshots.
