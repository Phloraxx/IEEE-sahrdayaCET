# Admin UI — Editorial-Monocle Design System

> One-to-one recreation of `admin-prototype.html` into the existing Next.js + shadcn/ui + Tailwind v4 stack.
> All data-fetching server components, API routes, auth guards, chair-scoping, form validations — untouched.

---

## 1. Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--paper` | `#f7f5f0` | Page background (warm off-white) |
| `--paper-alt` | `#f0ede7` | Card header / filter-bar / hover backgrounds |
| `--ink` | `#1a1a1a` | Primary text |
| `--ink-soft` | `#6b655a` | Secondary / description text |
| `--ink-muted` | `#a09a8e` | Muted labels / placeholders |
| `--ink-border` | `#ddd8d0` | Default border |
| `--ink-border-light` | `#e8e4dc` | Light border (card edges, row separators) |
| `--accent` | `#c14a3a` | Primary accent (buttons, active states, badges) |
| `--accent-hover` | `#a83a2c` | Accent hover |
| `--accent-light` | `#f5e6e3` | Accent-tinted backgrounds |
| `--success` | `#2e7d5e` | Success / confirmed states |
| `--success-light` | `#e8f3ee` | Success tint |
| `--warning` | `#b8860b` | Warning / pending states |
| `--warning-light` | `#f8f0e0` | Warning tint |
| `--danger` | `#b33a2a` | Destructive / cancelled states |
| `--danger-light` | `#f5e3e0` | Danger tint |

## 2. Typography

| Token | Stack | Usage |
|-------|-------|-------|
| `--font-serif` | `Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif` | Page titles, card titles, stat values, hero event title |
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Body text, labels, table content, buttons |
| `--font-mono` | `"SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, monospace` | Data values, IDs, slugs, amounts |

### Sizes
- **Page title** (`.page-title`): 1.6rem, serif, letter-spacing -0.01em
- **Page subtitle** (`.page-subtitle`): 0.8rem, sans, `--ink-soft`
- **Section label** (`.label`): 0.65rem, uppercase, letter-spacing 0.08em, `--ink-muted`, font-weight 600
- **Stat value** (`.stat-card-value`): 1.75rem, serif, leading 1.1
- **Card title** (`.card-title`): 1rem, serif
- **Table header**: 0.6rem, uppercase, letter-spacing 0.08em, `--ink-muted`, weight 600
- **Table cell**: 0.8rem

## 3. Spacing & Radii

| Token | Value |
|-------|-------|
| `--radius-sm` | 6px |
| `--radius-md` | 10px |
| `--radius-lg` | 14px |
| `--radius-xl` | 18px |
| Content padding (desktop) | 2.5rem × 2.5rem (40px) |
| Content padding (mobile) | 1.25rem → 1rem |
| Card padding | 1.75rem |
| Card header | 1.5rem 1.5rem 0.875rem |
| Filter bar padding | 1.25rem 1.75rem |
| Grid gaps | 2.5rem (desktop), 1.5rem (mobile) |

## 4. Sidebar

| Property | Value |
|----------|-------|
| Width | 220px (expanded), 56px (collapsed) |
| Background | `#1a1a1a` |
| Text color (default) | `#999` |
| Text color (active/hover) | `#e8e4dc` |
| Active item bg | `rgba(193,74,58,0.15)` |
| Hover item bg | `#2a2a2a` |
| Brand text | Uppercase serif "IEEE SAHRDAYA" + "Student Branch" sub |
| Logo | 28×28 red `#c14a3a` block with "SB" initials |
| Nav sections | "Navigation" (Overview, Events, Check-in), "Administration" (Registrations, Payments, Societies, Users) |
| Section labels | 0.55rem, uppercase, letter-spacing 0.1em, `#555` |
| Footer | User avatar (28×28, `#333` bg, `#999` text), name, role badge |
| Collapse toggle | 24×24 circle button at bottom-right, `--paper` bg |
| Mobile | Fixed position, slide in from left, overlay backdrop |

## 5. Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Sidebar (220px) │ Main                              │
│                 │ ┌─ Topbar ──────────────────────┐ │
│  ┌─ Header ─┐  │ │ Breadcrumb     Shortcuts      │ │
│  │ SB Logo  │  │ └───────────────────────────────┘ │
│  │ IEEE SB  │  │ ┌─ Content (max 1200px) ───────┐ │
│  └──────────┘  │ │                               │ │
│  ┌─ Nav ─────┐ │ │   Page-specific content       │ │
│  │ Overview  │ │ │                               │ │
│  │ Events    │ │ │                               │ │
│  │ Check-in  │ │ └───────────────────────────────┘ │
│  │──────────│ │                                    │
│  │ Registr.  │ │                                    │
│  │ Payments  │ │                                    │
│  │ Societies │ │                                    │
│  │ Users     │ │                                    │
│  └──────────┘ │                                    │
│  ┌─ Footer ─┐ │                                    │
│  │ User     │ │                                    │
│  └──────────┘ │                                    │
└───────────────┴─────────────────────────────────────┘
```

## 6. Component Anatomy

### Topbar
- Background: `var(--paper)`
- Border-bottom: 1px `var(--ink-border-light)`
- Sticky top, z-index 50
- Padding: 0.75rem 1.5rem
- Breadcrumb: monospace uppercase, `var(--ink-muted)`, accent-colored first segment
- Shortcuts: `var(--ink-muted)` text + kbd elements for keyboard hints

### Hero Event Card
- White background (`#fff`), 1px `var(--ink-border-light)` border
- 3px red top border via `::before` pseudo-element
- Padding: 2rem
- "Live now" or "Upcoming" badge
- Title in serif, date/venue in muted text
- "View Event" (accent button) + "Edit" (ghost button)
- Registration progress bar (5px height, rounded, accent fill)

### Stat Card
- White background (`#fff`), 1px `var(--ink-border-light)` border
- Padding: 1.75rem
- `.stat-card-label`: 0.65rem uppercase label + icon
- `.stat-card-value`: 1.75rem serif number
- `.stat-card-desc`: 0.7rem muted description
- Optional 3px accent top border via inline style

### Card
- White background (`#fff`), 1px `var(--ink-border-light)` border
- Border-radius: `var(--radius-lg)` (14px)
- Header: `.card-title` (1rem serif) + `.card-subtitle` (0.75rem soft)
- Body: padding 1rem 1.75rem 1.75rem
- Footer: border-top, 0.75rem soft text

### Filter Bar
- Background: `#fcfbf9` (slightly lighter than paper)
- Border-bottom: 1px `var(--ink-border-light)`
- Padding: 1.25rem 1.75rem
- Flex wrap, items centered, gap 0.75rem
- Contains: search input-group, select dropdowns, action buttons
- Border-radius: `var(--radius-lg) var(--radius-lg) 0 0`

### Data Table
- Full width, font-size 0.8rem
- TH: uppercase 0.6rem, `--ink-muted`, weight 600, bg `#fcfbf9`, padding 1rem 1.25rem
- TD: padding 1rem 1.25rem, border-bottom `var(--ink-border-light)`
- Row hover: background `#faf8f5`
- Active row (checked in): background `var(--accent-light)`

### Badges
- Inline-flex, padding 0.1em 0.5em, 0.6rem uppercase, letter-spacing 0.06em, weight 600
- Default: 1px `var(--ink-border)` border, transparent bg, `--ink-soft` text
- `.badge-accent`: `var(--accent)` border + text, `var(--accent-light)` bg
- `.badge-success`: `var(--success)` border + text, `var(--success-light)` bg
- `.badge-warning`: `var(--warning)` border + text, `var(--warning-light)` bg
- `.badge-danger`: `var(--danger)` border + text, `var(--danger-light)` bg

### Buttons
- Inline-flex, gap 0.375rem, padding 0.45rem 0.9rem, 0.75rem, weight 500
- Default: 1px `var(--ink-border)`, transparent, `--ink` text
- Hover: `var(--paper-alt)` bg
- `.btn-primary`: `--ink` bg + white text
- `.btn-accent`: `--accent` bg + white text
- `.btn-ghost`: transparent border, hover bg `var(--paper-alt)`
- `.btn-sm`: padding 0.3rem 0.6rem, font-size 0.7rem
- `.btn-icon`: 32×32 square, centered icon

### Inputs
- Block, width 100%, padding 0.5rem 0.75rem, 0.8rem
- Border: 1px `var(--ink-border)`, bg white
- Focus: `var(--ink)` border
- `.input-sm`: padding 0.35rem 0.6rem, font-size 0.75rem
- `.input-group`: flex row with icon, focus-within border `var(--ink)`

### Pagination
- Flex row, items-center, gap 0.5rem, padding 1rem 1.5rem
- Border-top: 1px `var(--ink-border-light)`
- `.page-btn`: padding 0.2rem 0.5rem, 0.7rem, 1px border, white bg
- `.page-btn.active`: `--ink` bg + white text
- `.page-btn:disabled`: opacity 0.3

### Progress Bar
- Height 5px, bg `var(--ink-border-light)`, overflow hidden, border-radius 999px
- `.progress-fill`: height 100%, bg `var(--accent)`, transition width 0.5s

### Form Section
- White bg, 1px `var(--ink-border-light)` border, padding 1.75rem
- `.form-section-title`: 0.9rem serif, margin-bottom 1.5rem, padding-bottom 0.75rem, border-bottom
- `.form-label`: 0.7rem uppercase, weight 600, letter-spacing 0.06em, `--ink-soft`
- `.required`: `var(--accent)` color

### Tabs (Custom, not shadcn)
- Border-bottom: 1px `var(--ink-border-light)`
- `.tab`: padding 0.875rem 1.75rem, 0.8rem, `--ink-soft`, 2px transparent bottom border
- `.tab:hover`: `--ink` color
- `.tab.active`: `--ink` color, bottom border `--ink`

### Avatar
- 32×32, centered initials, 0.65rem weight 600
- 1px `var(--ink-border)`, bg `var(--paper-alt)`, `--ink-soft` text

### Empty States
- Centered text, muted icon, "No events/registrations/users yet" message
- Action button: "Create Event" (primary) or "Clear filters" (ghost)

## 7. Responsive Breakpoints

| Width | Behavior |
|-------|----------|
| ≤900px | `.grid-4` → 2 columns |
| ≤768px | Sidebar becomes fixed overlay (slide from left), `.grid-*` → 1-2 columns, `.form-grid` → 1 column, page title smaller, topbar shortcuts hidden, hamburger visible, sidebar toggle hidden, content padding 1.25rem |
| ≤480px | `.grid-4` → 1 column, `.filter-bar` stacked vertically, stat card padding 1.25rem, content padding 1rem |

## 8. Animations

- `.fade-in`: opacity 0→1, translateY 4px→0, 0.25s ease
- `.delay-1` through `.delay-4`: stagger at 0.05s, 0.1s, 0.15s, 0.2s with `animation-fill-mode: both`
- Shimmer skeleton: gradient sweep at 1.5s for loading states
- Live pulse: pulsing green dot for live event indicator

## 9. shadcn CSS Variable Overrides (scoped to `.admin-editorial`)

These CSS variables override the default shadcn values when inside the admin layout:

| shadcn Variable | Override Value |
|----------------|----------------|
| `--background` | `var(--paper)` |
| `--foreground` | `var(--ink)` |
| `--card` | `#fff` |
| `--card-foreground` | `var(--ink)` |
| `--border` | `var(--ink-border)` |
| `--input` | `var(--ink-border)` |
| `--primary` | `var(--accent)` |
| `--primary-foreground` | `#fff` |
| `--secondary` | `var(--paper-alt)` |
| `--secondary-foreground` | `var(--ink)` |
| `--muted` | `var(--paper-alt)` |
| `--muted-foreground` | `var(--ink-soft)` |
| `--accent` | `var(--accent-light)` |
| `--accent-foreground` | `var(--accent)` |
| `--destructive` | `var(--danger)` |
| `--radius` | `0.625rem` |

---

*This document serves as the single source of truth for recreating the prototype in the Next.js codebase. Update it when adding new patterns or modifying existing ones.*
