# Design System Specification

- **Status:** Living
- **Scope:** `clients/web`
- **Name:** "Tactical Sand" — a light Material-3 system for the command console.

## 1. Overview

The design system is token-driven Material-3, implemented on **Tailwind v4** with a
small set of hand-built shadcn-style primitives. There is one source of truth for
design tokens: the `@theme` block in
[`src/styles/app.css`](../../clients/web/src/styles/app.css).

A **second, legacy** design language ("Aeronautic", dark) still ships for the
not-yet-converted modules. Converging onto one system is the primary debt this spec
tracks — see §6.

## 2. Tokens

All tokens are CSS custom properties declared in Tailwind v4's `@theme`, which
auto-generates the matching utilities (`bg-*`, `text-*`, `border-*`, `text-{size}`,
`p-{space}`, `rounded-{r}`).

### Color — Material-3 roles

The full M3 role set is defined (surface / on-surface / primary / secondary /
tertiary / error + container variants). The palette is the "tactical sand" warm
neutral:

| Role | Token | Value |
|------|-------|-------|
| Background / Surface | `--color-surface` | `#fff8f1` |
| On-surface (body text) | `--color-on-surface` | `#1d1b17` |
| Primary (near-black ink) | `--color-primary` | `#000101` |
| Accent / CTA (terracotta) | `--color-on-tertiary-container` | `#c66b52` |
| Critical | `--color-error` | `#ba1a1a` |
| Success | `--color-success` | `#1b5e20` |
| Warning | `--color-warning` | `#f57f17` |
| Borders | `--color-outline-variant` | `#c5c6ca` |

A **shadcn bridge** aliases semantic names (`--color-background`, `--color-card`,
`--color-muted`, `--color-destructive`, `--color-ring`, …) onto the M3 roles so the
primitives stay idiomatic.

### Typography

Family: **Source Sans 3** (`--font-sans`). A semantic type scale is defined as
`--text-*` tokens, each carrying size + line-height + weight (+ tracking):

`headline-lg` · `headline-md` · `headline-sm` · `body-lg` · `body-md` · `body-sm` ·
`label-md` · `label-sm` · `data-mono` (tabular numerics for readouts).

### Spacing & radius

Stitch grid tokens: `--spacing-gutter` (16px), `--spacing-margin-desktop` (32px),
`--spacing-margin-mobile` (16px). Radius: `--radius` (4px) / `--radius-lg` (8px) /
`--radius-xl` (12px).

### Iconography

Material Symbols Outlined via the [`Icon`](../../clients/web/src/components/ui/icon.tsx)
component (`<Icon name="dashboard" filled />`). Sizing through `text-[..]`, color
through `text-*`.

## 3. Cascade architecture

The hardest constraint: a light new system and a dark legacy stylesheet must coexist
without fighting. Solved with **explicit CSS cascade layers** (`app.css`):

```css
@layer theme, base, legacy, components, utilities;

@import '../index.css'   layer(legacy);   /* dark "Aeronautic" — unconverted modules */
@import 'tailwindcss';                     /* theme · base(preflight) · components · utilities */
@import './modules.css'  layer(components);/* light styles for escalation/report */
```

Ordering rationale:
- `legacy` sits **above** Tailwind's `base` (so preflight doesn't strip the old
  modules) but **below** `components`/`utilities` (so the new design always wins).
- The light module styles in `modules.css` live in `components`, beating `legacy`.

This is the mechanism that let the migration proceed module-by-module without a big-bang
rewrite. It is intentional and load-bearing; do not flatten it until the legacy system
is gone (§6).

## 4. Component layers (atomic structure)

| Layer | Location | Examples |
|-------|----------|----------|
| **Primitives** (atoms) | `components/ui/` | `Button`, `Card`, `Badge`, `Table`, `Icon` |
| **Shared** (molecules) | `components/` | `ErrorBoundary`, `OfflineBanner`, status badges |
| **Module features** (organisms) | `modules/*/components/` | `LiveMap`, `DeploymentsTable`, `MemoCard` |
| **Layout** (templates) | `shell/` | `CommandShell` (top bar + sidebar), `SplashScreen` |

### Primitive conventions

- Built with `class-variance-authority` for variants, `cn()` (clsx + tailwind-merge)
  for class composition, `@radix-ui/react-slot` for `asChild`.
- Skinned with **M3 utilities directly** (e.g. `bg-on-tertiary-container`) rather than
  the generic shadcn neutral palette, so primitives carry the brand by default.
- `Button` variants: `default` (ink), `accent` (terracotta CTA), `destructive`,
  `outline`, `secondary`, `ghost`. `Badge`: `critical` / `warning` / `success` /
  `neutral` / `outline` / `solid`.

### Motion

Centralized, restrained utilities in `app.css`: `.dm-lift` (hover lift), `.dm-reveal`
/ `.dm-stagger` (section reveals), `.dm-press` (press feedback). **All gated behind
`prefers-reduced-motion: reduce`.** New interactive surfaces should reuse these rather
than inventing per-component animations.

## 5. Usage guidelines

- **Never hardcode hex** in components. Use a token utility (`text-error`, not
  `text-[#ba1a1a]`). New colors are added to `@theme`, not inlined.
- **Type via scale tokens** (`text-headline-md`), not arbitrary `text-[24px]`.
- **Compose with `cn()`**; let `tailwind-merge` resolve conflicts.
- **Tabular data** (timecodes, counts) uses `font-data-mono` + `tabular-nums`.
- New primitives go in `components/ui/`; nothing app-specific in there.

## 6. Migration: retire the second design system

**Problem.** Two token systems ship: light "tactical sand" (`app.css`) and dark
"Aeronautic" (`index.css`, in the `legacy` layer). Dashboard, Escalation, and Report
are converted to light; **Evidence and the legacy dark shell remnants are not.**

**Target.** One system (light M3). `index.css` and the `legacy` cascade layer deleted.

**Plan.**
1. Convert **Evidence** to light using the same primitives + `modules.css` pattern
   (its dark styles live in `modules/evidence/evidence.css`).
2. Audit remaining consumers of `index.css` classes (`grep` for `.unified-*`,
   `.panel`, `.app-shell`, etc.); port or delete.
3. Remove the `legacy` layer import and `index.css`; collapse `app.css` ordering to
   `theme · base · components · utilities`.
4. Delete the Aeronautic font links from `index.html`.

**Definition of done:** `grep -r "layer(legacy)"` returns nothing and the app renders
identically.

## 7. Roadmap

- [ ] Formalize a component inventory page (Storybook or a `/styleguide` route) so
      primitives are visible and regression-checkable.
- [ ] Convert Evidence → light; remove the legacy layer (§6).
- [ ] Token contrast pass against WCAG AA (terracotta-on-surface, warning text).
- [ ] Dark mode: the M3 role structure already supports it via a `.dark` token block —
      a future opt-in, not a parallel stylesheet.
