# UI Audit & Design System Proposal — v5.24.0

**Method:** static analysis of `public/css/styles.css` (9,226 lines) and `public/index.html` (3,405 lines)
across three parallel passes — color/tokens, component uniformity, and typography/spacing/responsive.
Contrast ratios computed from relative luminance, not estimated. Builds on `ui-audit-v5.20.0.md`, which
fixed the undefined-variable bugs; this pass is about the system underneath them.

---

## The one-line summary

The v5.20.0 audit fixed the symptoms. This one found the cause: **there is no design system — there are
607 individual styling decisions.** 57 distinct font sizes, 26 spacing values, 18 hardcoded radii, and
14 token names covering 6 colors. Every component picked its own numbers. Nothing is broken enough to
notice one at a time, which is exactly why it accumulated.

The 80s synthwave identity is good and worth keeping. The problem isn't the look, it's that the look
isn't encoded anywhere, so every new feature re-invents it slightly differently.

---

## Severity 1 — Accessibility failures (fix regardless of anything else)

### 1.1 Text below the legibility floor
**128 font-size declarations render under 12px.** The worst are not typos:

| Size | px | Where |
|---|---|---|
| `0.35rem` | 5.6px | mobile lesson tag (styles.css:3058, `!important`) |
| `0.4rem` | 6.4px | lines 2880, 3065, 3268, 3347 |
| `0.42rem` | 6.7px | line 3258 |
| `0.55rem` | 8.8px | `.nav-label` base (line 1978) |
| `0.6rem` | 9.6px | 17 rules — badges, tags, delete buttons |

These cluster **inside `max-width: 768px` media blocks** — the smallest type in the app is deliberately
targeted at phones and iPads, which is the worst possible place for it. A first-grade teacher checking
next week's plan on an iPad is the actual use case.

### 1.2 Contrast failures

| Foreground | Surface | Ratio | Verdict |
|---|---|---|---|
| `--text-muted` #7F8CAA | `--card-bg-light` #1F3460 | **3.63** | fails body text |
| `--electric-purple` #9D4EDD as text | #0F0F23 (best case) | **4.10** | fails on *every* surface |
| `--electric-purple` as text | #1F3460 | **2.66** | fails badly |
| `--error-color` #E74C3C as text | #16213E | **4.16** | fails on 3 of 4 surfaces |

Purple is the app's second signature color and it is **unusable as text anywhere in the palette.** It's
safe only as a background, border or fill.

### 1.3 Touch targets under 44px
The most-tapped controls in the app fail the iOS/WCAG minimum on the devices where tapping matters:

- `.calendar-nav-bar .btn-icon` — **40×40px** (line 796, reinforced `!important` at 2990)
- Eleven prev/next/print/weekend buttons hard-pinned to 40px **inline in the markup** (index.html:673–724)
- A `min-width: 768px` rule bumps them to 44px on desktop — so the correct size applies exactly where
  it doesn't matter, and the undersized one applies on phone and iPad-portrait

### 1.4 Three different colors mean "focused"
There is no `--focus-ring` token. `:focus` styles hardcode `--neon-pink`, `--neon-purple`, and
`--cyan-blue` in different places. Worse: **`.form-control` is used on 145 elements but has no base CSS
rule.** It only looks styled because most instances sit inside a `.form-group`, which styles the bare
`input`/`select`/`textarea` tag. **26 of those 145 are not wrapped**, so they render as unstyled native
controls with only the generic outline — and each has been patched individually with inline styles.

---

## Severity 2 — The specificity war

**162 `!important` declarations in the stylesheet; 91 of them (56%) in one block, lines 2836–3150.**
Plus **25 more inline in the markup**, all in the Month/Week/Day nav bars (index.html:672–728).

The same properties — `display`, `width`, `height`, `gap` — are set three times over: base rule, then a
media query with `!important` (commented *"CRITICAL: ensure all buttons visible"*), then inline with
`!important` again. Three escalating layers for one visual outcome.

That comment is the tell. Something was intermittently winning the cascade, and instead of finding it,
the fix was applied at maximum force in two more places. This is now the single biggest obstacle to
changing anything in those views — and it's the reason the nav buttons are stuck at 40px.

### Component drift

| Finding | Detail |
|---|---|
| `.btn-success` | Used in `index.html:727`. **Never defined in CSS.** It's been rendering as a plain `.btn-sm`. |
| `.btn-danger` | **Defined three times** (453, 1855, 8944). The first two are dead code. |
| `.modal-large` | Defined twice: `max-width: 600px` (2044) and `700px` (4215). The 600px rule is dead. |
| Small-button radii | `.btn-sm` uses the 12px token; `.btn-xs` 5px, `.btn-newsletter` 6px, `.btn-ghost` 5px |
| Border weights | `.btn-ghost` 1px; every other bordered button 2px |
| Card radii | Four different values for card-like surfaces: 24px, 32px, 12px, 8px |
| Dead classes | `.btn-icon-sm`, `.btn-ai`, `.btn-xs`, `.btn-share-resource` appear in no static markup |

### A second design system snuck in
Around the curriculum scan-review UI (lines ~4780–4870, ~8500s) there's a **light Material palette**
bolted onto the dark theme: `#90CAF9`, `#A5D6A7`, `#EF9A9A`, `#FFCC80`, `#1565C0`. No tokens, wrong
theme, and it fails contrast on the dark surfaces it sits on.

---

## Severity 3 — No scale, anywhere

**Type:** 607 font-size declarations, 57 distinct values. Six of them fall within 1.6px of each other
(0.7 / 0.72 / 0.75 / 0.78 / 0.8 / 0.82 / 0.85rem). That isn't a scale, it's accretion.

**Spacing:** 187 distinct padding strings, 58 margin strings, reducing to 26 atomic values — only 10 on
a 4px grid. Off-grid values (7px, 9px, 11px, 13px, 15px, 18px, 26px) recur often enough to constitute a
second, incompatible system running alongside the first.

**Radius:** 4 tokens exist and are well-adopted (~150 uses), but **18 hardcoded values bypass them**,
including both `999px` and `99px` for the same pill shape.

**Color:** 14 token names resolve to 6 colors. `--electric-purple` (25 uses) vs `--neon-purple` (23)
is an even split, so neither reads as canonical. Meanwhile `#FFF` appears 35 times as a literal instead
of `--text-primary`, `#FF6B9D` 30 times instead of the token, `#9D4EDD` 23 times. And
`rgba(255,255,255,0.1)` appears **44 times** with no token at all — with 0.05, 0.06, 0.07, 0.08 and 0.12
variants adding ~90 more near-identical hairlines.

**Dead tokens:** `--error-color`, `--warning-color`, `--color-text-success` are defined and never used.

**Breakpoints:** 52 media blocks. Mostly 768px, but two rules use `769px` — a 1px gap at exactly 768px,
which is iPad-portrait CSS width.

**Density:** header ~72px + nav bar ~88px + bottom nav ~60px = **~220px of a 732px laptop viewport, 30%
chrome before any content.**

---

## The proposed system

Keep the synthwave identity. Encode it. Every value below is computed, not chosen by eye.

### Color — primitives stay, roles get added

The failure mode today is that raw palette colors get used for semantic jobs they can't do (purple as
text). Split them:

```css
/* Primitives — the 80s palette, unchanged, ONE name each */
--pink-500:#FF6B9D;  --pink-600:#E84A7F;
--purple-500:#9D4EDD; --purple-600:#7B2CBF; --purple-300:#BE8CEC;
--cyan-500:#00D4FF;  --orange-500:#FF8C42;
--yellow-500:#FFD93D; --teal-500:#6FFFE9;

/* Surfaces */
--bg-base:#0F0F23; --bg-sunken:#1A1A2E; --bg-surface:#16213E; --bg-raised:#1F3460;

/* Text — muted corrected to pass on the lightest surface */
--text-primary:#FFFFFF;
--text-secondary:#B8C1EC;   /* 6.91 on raised — passes */
--text-muted:#9AA7C8;       /* was #7F8CAA (3.63 FAIL) → now 5.08 everywhere */
--text-accent:var(--purple-300);  /* 4.74 on raised — the ONLY purple safe as text */

/* Borders — replaces ~130 ad-hoc rgba hairlines */
--border-subtle:rgba(255,255,255,0.06);
--border-default:rgba(255,255,255,0.12);
--border-strong:rgba(255,255,255,0.22);

/* One focus color, everywhere */
--focus-ring:var(--cyan-500);   /* 6.90 min across all surfaces */

/* Status — all corrected to pass on every surface */
--danger:#FF8A80;   /* was #E74C3C (3.20 on raised) → 5.35 */
--success:#5FE39B;  /* was #2ECC71 → 7.53 */
--warning:#FFC04D;  /* was #F39C12 → 7.51 */
--info:#5FDFFF;     /* new — there was no info token → 7.85 */

--scrim:rgba(0,0,0,0.72);  /* replaces 3 different hardcoded overlay alphas */
```

**Rule:** purple is never text. Use `--text-accent` (#BE8CEC) when you want purple-flavored type.

### Type — 8 steps, 12px floor

| Token | Size | Use |
|---|---|---|
| `--text-2xs` | 11px | numeric chips only — never sentences |
| `--text-xs` | 12px | **the floor for anything a teacher reads** |
| `--text-sm` | 14px | secondary text, table cells |
| `--text-base` | 16px | body |
| `--text-lg` | 18px | card titles |
| `--text-xl` | 22px | section headings |
| `--text-2xl` | 28px | view titles |
| `--text-3xl` | 36px | display |

57 values collapse to 8. Every sub-11px declaration goes.

### Spacing — 4px grid, 10 steps
`--space-1:4px` `2:8` `3:12` `4:16` `5:20` `6:24` `8:32` `10:40` `12:48` `16:64`
No 7px, 9px, 11px, 13px, 15px, 18px, 26px.

### Radius — 6 steps
`--radius-xs:6px` `sm:10` `md:14` `lg:20` `xl:28` `full:999px`
One pill value, not two.

### Controls — one size system
`--control-sm:36px` `--control-md:44px` `--control-lg:52px`
**44px is the floor for anything tapped on a touch device**, at every breakpoint — not just above 768px.

---

## Recommended order of work

1. **Contrast + touch targets** — the four failing colors, the 128 sub-12px declarations, the 40px nav
   buttons. Pure accessibility, no visual risk, ~1 day.
2. **Kill the specificity war** — find what the nav bars were fighting, delete all 25 inline
   `!important`s and most of the 91 in the media block. Unblocks everything else.
3. **Land the token layer** — add the new tokens alongside the old, no visual change on its own.
4. **Migrate component by component** — buttons first (most drift), then cards, then forms. Delete the
   dead `.btn-danger` duplicates and define `.btn-success`.
5. **Give `.form-control` a real base rule** and remove the 26 inline patches it's been standing in for.
6. **Retire the light Material palette** in the curriculum scan UI.

Steps 1 and 2 deliver most of the visible benefit. Steps 3–6 are what stops it happening again.
