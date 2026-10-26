---
name: ui-ux-design
description: >-
  Expert guidelines, workflows, and standards for UI/UX design, frontend architecture, 
  RTL/Persian typography, accessible component design (WCAG AA), and high-density 
  financial/data dashboards. Use whenever designing, creating, or refactoring user interfaces, 
  pages, components, design systems, or UX flows.
---

# UI/UX Design & Frontend Engineering Skill

This skill guides the design, implementation, and review of world-class user interfaces and user experiences with a special focus on modern web applications, RTL/Persian typography, design systems, and data-dense fintech dashboards.

---

## 1. Core UX Principles & Heuristics

1. **Clarity over Cleverness:** Make the purpose of every screen immediately obvious. Use clear headings, short descriptive copy, and visible primary actions.
2. **Predictable Information Hierarchy:**
   - **Level 1 (Top / Summary):** Key performance indicators (KPIs), health status badges, and critical alerts.
   - **Level 2 (Middle / Analysis):** Filterable data grids, charts, trends, and breakdown cards.
   - **Level 3 (Details / Action):** Drawer/modal inspection, audit histories, and editable forms.
3. **Four Core UI States for Every View:**
   - **Loading State:** Skeleton loaders that match the exact shape of the resulting content (avoid generic spinners when possible).
   - **Empty State:** Friendly visual icon, clear explanatory title, and a direct Call to Action (CTA) button to get started.
   - **Error State:** Human-readable Persian error message with recovery/retry options.
   - **Ready/Data State:** Clean presentation with consistent spacing and alignment.
4. **Immediate Feedback & Optimistic UI:**
   - Visual feedback on clicks (active states, subtle transitions).
   - Async actions must display busy indicators (disabled state with loading text/spinner) to prevent double submissions.

---

## 2. RTL & Persian Typography Standards

1. **Font Family & Hierarchy:**
   - Primary Persian font: `IRANYekanX` / `Vazirmatn` with weights `400` (Regular), `500` (Medium), `700` (Bold), and `800` (Extra Bold).
   - Line height for Persian body text must be generous: `1.7` to `2.0` (e.g. `leading-relaxed` or `leading-loose`).
   - Minimum font size for body text: `14px` (`text-sm`). Microcopy/badges: `11px-12px` (`text-[11px]` to `text-xs`).
2. **Numerals & Format Rules:**
   - **Persian Numbers (`fa-IR`):** Amounts, percentages, row counts, dates, and metrics (e.g. `۱۲۵٬۰۰۰٬۰۰۰ ریال` or `۷۲٪`).
   - **Latin Numbers (`ltr` / monospace):** Account codes, UUIDs, IBANs, email addresses, technical IDs, and date inputs (`type="date"`). Always set `dir="ltr"` and `font-mono`.
3. **Logical CSS Properties (Crucial for RTL):**
   - Use `start` / `end` instead of `left` / `right`:
     - `text-start` / `text-end` (not `text-left` / `text-right`)
     - `ps-*` / `pe-*` (padding-inline-start / padding-inline-end)
     - `ms-*` / `me-*` (margin-inline-start / margin-inline-end)
     - `start-*` / `end-*` (inset-inline-start / inset-inline-end)
     - `border-s-*` / `border-e-*`
   - Flex/Grid alignments: Rely on default directionality.

---

## 3. Financial & Data Dashboard Best Practices

1. **Data Density & Readability:**
   - **Executive Views:** Generous whitespace, large KPI figures, contextual comparisons (e.g., `+12% نسبت به ماه قبل`).
   - **Operational/Accounting Grids:** High density, compact row padding (`py-2.5` to `py-3`), sticky headers, and tabular numbers (`tabular-nums font-mono`).
2. **Semantic Color Palette:**
   - **Action & Brand:** Electric cyan / primary brand token for buttons, links, and selected states.
   - **Intelligence & AI:** Purple / Violet accent for AI-generated insights, recommendations, and predictions.
   - **Status Indicators:**
     - 🟢 **Success / Healthy:** Emerald (`text-emerald-600 dark:text-emerald-400`, `bg-emerald-500/10`)
     - 🟡 **Warning / Attention:** Amber (`text-amber-600 dark:text-amber-400`, `bg-amber-500/10`)
     - 🔴 **Error / High Risk:** Rose / Red (`text-rose-600 dark:text-rose-400`, `bg-rose-500/10`)
     - ⚪ **Neutral / Info:** Slate / Zinc (`text-muted-foreground`, `bg-muted/40`)
   - *Never use status colors for purely decorative purposes.*

---

## 4. Accessibility (a11y) & Usability (WCAG AA)

1. **Touch Targets:** Minimum `44x44px` interactive area on mobile and touch surfaces.
2. **Keyboard Navigation & Focus:**
   - All interactive elements must have visible `:focus-visible` styling (e.g., `focus-visible:ring-2 focus-visible:ring-primary`).
   - Modals and drawers must trap focus and close on `Escape`.
3. **Contrast Ratios:** Text against background must have at least `4.5:1` contrast ratio (`3:1` for large text).
4. **Color Independence:** Do not convey status by color alone; always pair color with text or an identifiable icon.
5. **Reduced Motion:** Honor user preferences with `motion-reduce` or `prefers-reduced-motion`.

---

## 5. Component Construction Guidelines (Tailwind / React)

1. **Design Tokens:** Always consume semantic Tailwind classes (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) rather than hardcoded hex colors (`#ffffff`, `#000000`).
2. **Forms & Inputs:**
   - Clear `<label>` associated with inputs (use `sr-only` if visual label is omitted).
   - Show inline validation errors right next to the invalid field.
   - Use standard HTML input types (`type="email"`, `type="date"`, `inputMode="numeric"`).
3. **Modals & Overlays:**
   - Keep forms inside drawers or modals focused on single tasks.
   - Include clear confirmation for destructive actions (e.g. deletion, undoing batches).
