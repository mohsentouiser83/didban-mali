# Project instructions

These instructions apply to work in this repository and its subdirectories.

## UI and UX design requirements

- Preserve the project's existing font system: IRANYekanX for body text and numeric data, and Anjoman Max for headings where the existing design uses it. Use the existing font tokens; do not introduce or substitute fonts without an explicit user request.
- Follow the project's existing theme and design system. Reuse its color, typography, spacing, border, radius, and component tokens. New pages must look consistent with the rest of the product.
- All user-facing form controls must use the project's shared components in `apps/web/components/ui`, including text and numeric inputs, textareas, selects, checkboxes, radio groups, switches, and date pickers. This applies to forms, filters, tables, dialogs, and drawers throughout the application.
- Browser-default controls are not acceptable in product UI. In particular, never use a raw HTML `<select>` or a native browser dropdown as a substitute for the project's `Select` component. Use `Input`, `Textarea`, `Checkbox`, `RadioGroup`, `Switch`, and `PersianDatePicker` for their respective controls. Styling a native control directly in a page does not satisfy this requirement.
- All action buttons, including icon-only actions and overlay close buttons, must use the shared `Button`. Compose modals from the shared `Dialog`, side overlays from `Drawer`/`Sheet`, and destructive confirmations from `ConfirmDialog` in `apps/web/components/ui`. Do not build page-local modal backdrops, portals, focus traps, or raw dialog elements; keep overlay behavior and styling in the shared components. Preserve deliberately non-modal workspace panels as non-modal.
- If a required control is missing, create or extend a reusable shared component consistent with the existing design system before using it in a page. Native elements needed internally by shared components for semantics, accessibility, or file selection must not expose an unstyled browser-default control to users.
- Before any UI design, redesign, or frontend layout change, read and apply the relevant available design skills. Start with `.agents/skills/ui-ux-design/SKILL.md` and use other applicable design skills when needed. Skill use is mandatory for design work.
- Give distinct business entities their own navigation and dedicated management pages. Do not put every feature and management form into a single page.
- Financial periods must be a first-class entity with dedicated create, read, update, and delete (CRUD) flows. Reporting pages may select a period; period management belongs in its own area.
- Use icons consistently with the project's existing icon library and components. Use purposeful animations for transitions, interaction feedback, and state changes; respect reduced-motion preferences.
- Maintain clear visual hierarchy, readable tables, appropriate spacing, accessible controls, and usable responsive layouts. Preserve Persian RTL behavior throughout.
- Check the affected pages after every design change, including dependent pages, populated and empty states, loading and error states, and mobile layouts. Fix visual and interaction regressions before considering the work complete.
- The receivables page has been reported as visually disrupted after the recent changes. Treat this as an existing issue to address when working on that page; do not assume the current layout is an acceptable design reference.

## Interaction and information architecture

- Design filters around a clear user task. Give controls explicit labels, group related choices, make the active selection and affected results apparent, and provide a clear way to reset. Avoid presenting saved periods, date presets, custom ranges, and management actions as an undifferentiated row of competing controls.
- Filters must have purposeful feedback for selection, expansion/collapse, and resulting data updates. Use short, consistent transitions; do not rely on color changes alone to explain state.
- Page navigation and asynchronous loading must provide visible, consistent feedback. Use skeletons that match the eventual layout, a restrained loading animation, and a smooth reveal of loaded content. Preserve layout and avoid flashes, artificial delays, or replaying entrance animations on every render.
- Statistics cards must have their own restrained motion for initial appearance, loading-to-data transitions, and actual value changes. A hover color transition alone does not satisfy this requirement. Keep values readable and accurate, avoid layout shifts and replaying animations on unrelated renders, and honor reduced-motion preferences with static feedback.
- Animate transitions between views that remain within one workspace, including any retained tabs. Respect reduced-motion preferences with immediate state changes and static loading feedback. Animation does not make an unsuitable navigation structure acceptable.
- Do not use tabs to combine the current cashflow page's period report and 30-day forecast. They serve distinct tasks and need clear, separately addressable destinations within cashflow navigation, each with an obvious title and active navigation state.
- Design the daily balance and cash movement section around a decision the user needs to make. Do not reproduce the current chart followed by a long daily list as the default layout. Show an understandable summary and overview first, then offer relevant transaction or day details through deliberate drill-down. Add a full table only when it supports an identified task; keep its scope, filtering, and pagination clear.
- Keep data maintenance workflows separate from report consumption when their complexity warrants it. Receipt-history management is a candidate for its own page; the user has suggested this, but has not yet chosen that structure. Evaluate a dedicated page versus a focused contextual flow before implementing the move. Do not treat this suggestion as an approved relocation.
- Verify motion and interaction in the running browser, including filter changes, loading, page navigation, view changes, keyboard use, and reduced motion. Static screenshots and passing component tests alone do not establish that these requirements are met.
- Use the built-in Codex Browser for all project UI testing. Do not launch a separate browser or external browser window for these checks.

## Code quality and architecture

- All new and modified frontend and backend code must be clean, readable, maintainable, and consistent with applicable language, framework, security, and accessibility standards. Follow repository conventions unless they conflict with these instructions.
- Keep responsibilities separate, dependencies explicit, and functions and modules focused. Avoid duplication, unnecessary abstractions, oversized files, and unrelated changes.
- Extract distinct UI sections into focused components. Do not leave substantial independent sections embedded in a large page or view.
- When a component is used in multiple places, give it a name that reflects its shared responsibility rather than its original page. Update its file name, exports, imports, and usages consistently, and place it in the appropriate shared location.
- All views must be UI-only: render data and expose interaction callbacks. Keep fetching, mutations, business rules, calculations, data transformation, and workflow orchestration in dedicated hooks, services, or controllers outside the view. Local state for purely visual interactions may remain in the view.
- In the backend, keep routes/controllers focused on request validation, authentication/authorization, calling application services, and formatting responses. Put business rules in services/domain modules and database access in the appropriate data layer. Preserve transaction boundaries and company/tenant isolation.
- Use TypeScript types and Python type annotations appropriately. Validate external inputs, handle errors explicitly, and never expose secrets or sensitive data in logs or client responses.
- Use Tailwind CSS utilities for all new or changed UI styling. Use existing design tokens through Tailwind utilities; do not add handwritten CSS, CSS modules, inline style declarations, or CSS-in-JS for layout, typography, colors, spacing, or other visual styling.
- Animation definitions are the only exception to the Tailwind-only styling rule: custom keyframes and animation-specific CSS are allowed when needed. Keep all other styling in Tailwind.
- When modifying existing components, migrate the styling of the changed sections to Tailwind. Do not expand this into an unrelated project-wide migration unless requested.
- Verify changed behavior with appropriate checks and meaningful tests. Review shared component usages and affected views when extracting, renaming, or moving code.

## Product copy

- Keep visible text concise and necessary for the user's immediate task.
- Do not add unsolicited guidance, explanatory paragraphs, subtitles, subdescriptions, or repetitive helper text.
- Avoid verbose notices such as: «تاریخچه وصول ۱۰ فاکتور کامل نیست. برای محاسبه مانده تاریخی، تاریخ و مبلغ تمام وصول‌ها را ثبت کنید.»
- When a validation error or financial-data limitation must be shown to prevent misunderstanding, use the shortest clear message at the relevant control or result. Do not hide a material limitation or imply that incomplete calculations are complete.
- Concision must not make a message vague. Do not use unexplained labels such as «گزارش تاریخی ناقص است.» State the specific missing data and its effect on the affected result in language a financial user understands. Prefer a local unavailable state and a relevant action over a standalone warning paragraph; for example, identify missing receipt dates where they prevent calculating a period balance.
- Do not display «گردش بانک؛ شامل انتقال بین حساب‌ها» as a routine standalone sentence. Make the metric's scope clear through accurate labels and, only when needed, concise details available on demand. Retain material calculation limitations without filling the page with explanatory copy.

## UX implementation status

- The receivables page now places the specific missing-receipt-date limitation at the unavailable period balance. Current customer balances remain available. The period filter uses a compact summary and a focused selection drawer with explicit apply and reset actions.
- Shared overdue filters show a check mark and transition when selected. Page navigation has a skeleton and content reveal; statistics cards have staggered entrance and loading/value-update motion. Rendered animation styles and affected pages were checked in the running browser.
- The cashflow period report and 30-day forecast now have separate routes and sidebar destinations. The period report shows a balance overview; daily details open on demand in a drawer instead of a default long daily table. Desktop and mobile layouts and day navigation were checked.
- Receipt history remains a contextual drawer opened from the receivables header. A dedicated page remains a possible future design decision, not an approved relocation.
- Motion uses reduced-motion guards and static loading fallbacks. A live browser test with the operating system's reduced-motion preference enabled remains unverified; do not describe source checks as that test.
- Implementation and checks do not constitute user acceptance of the design. Continue applying the interaction requirements above to future changes.

## PDF generation preferences

- Use IRANYekanX as the default PDF font family.
- Embed/register IRANYekanX in every generated PDF when the font file is available.
- Prefer the regular, medium, bold, and extra-bold IRANYekanX weights when available.
- For Persian/Farsi text, use right-to-left layout and proper Arabic/Persian shaping.
- Default page size: A4.
- Default margins: 18mm to 22mm unless the document needs a denser layout.
- Use Persian digits only when the document language/context is Persian; otherwise keep standard Latin digits.
- If IRANYekanX is not available, ask before using a fallback font.
- Before finalizing important PDFs, render pages to images and visually check layout, text clipping, direction, and font rendering.

## Shared tables and statistical cards

- Compose every product table with `components/ui/table.tsx` (`Table`, header/body/row/cell primitives and `TableRowHeader` for row labels). Use `FinancialDataTable` for column-driven grids. Raw table elements belong only in the shared primitive implementation.
- Keep horizontal scrolling inside the shared table container; preserve keyboard access, RTL, header scope, loading/empty states, and existing mobile card alternatives.
- Use `components/ui/financial/stat-cards.tsx` for metric groups and `StatCard` or `KpiMetricCard` for individual metrics. Their common surface is `MetricCardFrame`; do not create independent KPI card shells in pages.
- Preserve zero versus unavailable data, exact financial values, loading/value-change motion, and reduced-motion behavior. Check affected tables and metrics in the built-in browser at desktop and mobile widths.

## Shared charts and content states

- Compose charts with `components/ui/financial/financial-chart.tsx`: `FinancialChart`, `ChartGrid`, `ChartXAxis`, `ChartYAxis`, `ChartTooltip` and `ChartTooltipSurface`. Keep chart-specific series and business data in focused views and hooks. Direct Recharts container/axis/tooltip infrastructure in product views is prohibited by ESLint.
- Use `LoadingState` for waiting regions and `Skeleton`/`Spinner` for their primitives. Match loading geometry to the eventual content, label the region in Persian, hide decorative skeletons from assistive technology, and respect reduced motion. Do not introduce custom loading rings or pulsing placeholders in pages.
- Use `EmptyState` (including the table's `TableEmptyCell`) for missing/filtered results, `ErrorState` for request and validation errors, and `StatusMessage` for contextual notices. Existing shared `Alert` remains appropriate for form feedback requiring its semantics/ref behavior. Reuse the common retry/reset actions; preserve local financial limitations.
- Distinguish missing chart values from zero, keep gaps disconnected, show a visible point for single-point data, and keep exact values available in details. Check rendered SVG dimensions, tooltips, keyboard use, and desktop/mobile states in the built-in browser; DOM node presence alone does not establish a visible chart.
- Next.js error boundaries should use the installed version's `retry` callback to re-fetch failed content. The global boundary must provide its own styles and fonts, and must not promise that an unverified financial operation succeeded.

## Shared menus, tabs, tooltips and status badges

- Compose action menus with `components/ui/dropdown-menu.tsx`. Use shared Popover for rich non-menu content. Preserve RTL arrow keys, Escape, selected/current states and focus return. Keep mobile menus within the viewport; prefer a direct list when nested menus cannot fit.
- Compose in-place tabs with `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` from `components/ui/tabs.tsx`. Do not recreate tab roles on Button or native elements. Keep separately addressable business navigation as links, including cashflow report and forecast destinations.
- Use shared `Tooltip`/`ActionTooltip` for action descriptions and `Hint` for explanations that must also open by touch or keyboard. Use `TruncatedText` for clipped values so fully visible table cells do not add unnecessary focus stops. Do not use native HTML `title` tooltips. Tooltip descriptions must not hide required validation or material financial limitations.
- Use `Badge` as the common badge surface. Domain `StatusBadge`, `StatusChip`, and `RiskBadge` compose it; reuse them for statuses and keep domain labels accurate. Unknown statuses remain neutral and read «نامشخص». Preserve zero scores, readable labels, accessible decorative icons and reduced-motion guards.
- Verify desktop/mobile menus, actual tab keyboard interaction, tooltip dismissal, focus return and populated badges in the built-in browser. Component tests or source inspection do not replace browser verification.

## Shared notifications and form feedback

- Use `notify` and `Toaster` from `components/ui/sonner.tsx`; do not import Sonner directly in pages, hooks, or product components. Keep RTL, theme tokens, a Persian close label and usable mobile dismissal targets. Material error notifications remain until dismissed; inline validation must remain at the relevant control.
- Compose every form with `Form` from `components/ui/form.tsx` or `DrawerForm`, which uses it. Native constraints use concise Persian `FieldError` messages, preserve `aria-describedby`, mark invalid controls, and focus the first invalid field. Do not restore browser validation bubbles. Explicit custom validation may use `noValidate` and must provide equivalent field messages and focus handling.
- Use `FieldError` and `FieldDescription` from `components/ui/field.tsx` for field errors and helper text, and `FormMessage` for operation errors, success, or information inside a form. Keep `ErrorState` for failed content requests and `StatusMessage`/`Alert` for broader notices. Never display an empty error or announce historical errors as new failures.
- UI constraint checks are not domain validation: preserve financial rules and server validation in controllers/services. Do not submit invalid or whitespace-only required values. Keep values after a failed operation and do not auto-dismiss success before the user can read it.
- Test invalid submission, correction, field associations, first-error focus, dates, notification dismissal and desktop/mobile layouts in the built-in browser. Use non-sending previews or mocked services for success/error notifications when a real action would send a ticket, create business data, or confirm financial figures.
