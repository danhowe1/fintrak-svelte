# Styling Conventions

Use shared UI primitives first. Only use one-off Tailwind utility strings when the pattern is truly unique.

## Core rules

- Prefer component APIs over raw class strings for interactive UI:
- Use [`Button.svelte`](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/lib/components/ui/Button.svelte) for all `<button>` actions.
- Use [`SegmentedControl.svelte`](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/lib/components/ui/SegmentedControl.svelte) for tab-like chip controls.
- Use [`AppTable.svelte`](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/lib/components/ui/AppTable.svelte) for tables.
- Use [`StatusMessage.svelte`](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/lib/components/ui/StatusMessage.svelte) for info/success/warning/error banners.

## Form controls

- Labels: `app-label`, `app-label-inline`, `app-label-compact`
- Inputs/selects: `app-input`, `app-input-compact`, `app-input-compact-lg`, `app-input-block-compact`
- Errors: `app-error`

## Layout and typography

- Panels/cards: `app-panel`, `app-card`, `app-card-muted`
- Titles: `app-title-lg`, `app-title-sm`
- Supporting text: `app-text-muted`, `app-hint`, `app-field-caption`

## Tables

- Table shell: `app-table` (or `<AppTable>`)
- Sections: `app-table-head`, `app-table-body`
- Cells: `app-cell`, `app-cell-strong`

## Buttons

Use `Button` props instead of class strings:

- `variant`: `primary`, `secondary`, `secondary-subtle`, `danger`, `ghost`, `pill-secondary`
- `size`: `2xs`, `xs`, `sm`, `md`
- `pill`: `true` for rounded pill buttons

If you need a new recurring button style, add it to `Button.svelte` rather than duplicating classes.
