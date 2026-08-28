# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
User instruction entries should follow this format:

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
Entries discovered by the Agent during task execution should follow this format:

[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Deduplication Strategy
- Before adding a new entry, check for similar or identical instructions.
- If a duplicate is found, skip the new entry or merge it with the existing one.
- When merging, update the context or date information.
- This helps avoid redundant entries and keeps the memory file tidy.

## Entries

[Project Knowledge Summary]
- Date: 2026-08-28
- Context: Discovered while fixing the collapsed Notifications side panel (overlay bug)
- Category: Environment Configuration
- Instructions:
  - The frontend uses Tailwind CSS v4 (vite plugin). The important modifier is a SUFFIX (`absolute!`, `px-3!`); the v3 prefix syntax (`!absolute`, `!px-3`) generates NO CSS in this project.
  - Legacy v3-style `!` classes across the codebase (e.g. `btn btn-ghost !px-3`) are therefore inert; custom non-layered CSS in index.css (e.g. `.btn`, `.glass-strong { position: relative }`) wins over layered Tailwind utilities.
  - For overlays built on `.glass`/`.glass-strong`, set position/inset via inline `style` — inline styles always beat the non-layered `.glass-strong` rules.
  - CRITICAL: `.glass`/`.glass-strong` set `backdrop-filter`, which makes any element the CONTAINING BLOCK for `position: fixed` descendants. Overlays rendered inside the glass header (Notifications panel, ThemePanel, mobile drawer, CommandPalette) get squashed to header height. All such overlays MUST use `createPortal(…, document.body)`.
  - `npm run build` must run inside /workspace/frontend; running npm from /workspace fails with exit 254 ENOENT.

[User Instruction Summary]
- Date: 2026-08-28
- Context: Invoice entry form redesign iterations
- Instructions:
  - Form fields must follow the sequence they will actually be filled in (contract first, then identity fields, service scope, amount, remarks last); no random grouping.
  - Auto-generated serial number format is "XXX - YY" (XXX = running invoice count for the Gregorian year, YY = fiscal-year tag, Pakistan FY Jul–Jun labelled by ending year); display it compactly inline, never as a large dedicated card.
  - Validation errors should only appear when the user attempts to save; after a blocked save, mark fields and clear each error live as it is fixed.
