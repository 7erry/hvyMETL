# UI Design Review

Reviewed against the studio as of hvyMETL 6.0.3. Keep the leafy-green palette and Euclid Circular A. The work below is how the studio presses, drags, and settles.

Sources: [`web/src/theme.css`](../web/src/theme.css), [`web/src/components/ResizableSplit.tsx`](../web/src/components/ResizableSplit.tsx), [`web/src/components/ResizableVerticalSplit.tsx`](../web/src/components/ResizableVerticalSplit.tsx), [`web/src/components/copilot/CopilotResizeDivider.tsx`](../web/src/components/copilot/CopilotResizeDivider.tsx), [`web/src/consent/CookieConsentBanner.tsx`](../web/src/consent/CookieConsentBanner.tsx)

## Press

Press the control the instant the pointer goes down. Buttons currently drop 1px on `:active` after a 100ms transform (`button:active` in `theme.css`). Scale to `0.97` on press, with no delay. A developer clicking Import or Run pipeline should feel the button give immediately.

## Resize

Let the resize dividers resist at the edge, then settle. `ResizableSplit`, the vertical split, and the Copilot divider already follow the pointer 1:1 and keep pointer capture. At the min and max width they stop dead (`Math.min` / `Math.max` on the pointer position). Past that edge, follow with a rubber-band, then spring back on release. Use a critically damped spring (damping `1.0`, response about `0.3` seconds). A resize is not a flick, so it should not bounce.

## Surfaces

Open and close each surface along the same path.

- The cookie banner should rise from the bottom and dismiss back down.
- The preference center is a modal task. Keep the dim scrim, and scale it from the Cookie Preferences control with no bounce.
- Copilot is a side panel beside the work, so leave it without a scrim. A panel that enters from the right should leave to the right.

## Materials

Use the blur that already exists, and stop there. The diagram view dock is the one translucent layer (`.diagram-view-dock`, `backdrop-filter: blur(6px)`). Make the status footer the same kind of bar, with the canvas scrolling underneath. Keep the sidebar a solid, heavier surface. Do not put a second blurred panel on top of the dock.

## Reduced motion

Honor reduced motion in the studio stylesheet. `theme.css` has no `prefers-reduced-motion` rule. The architecture page does. Copilot’s shimmer, pulsing dots (`.copilot-typing__dot`), and the pipeline spinner (`.pipeline-spin`) should become a static or opacity-only state when that setting is on. Drop the 2px dot hop.

## Type

Tighten tracking only as type gets larger. Small uppercase labels at `0.04em` (`.panel h3` and similar) are fine. Body copy in the sidebar and the cookie banner should stay near `0`. Any title larger than the panel headings should use slight negative tracking and tighter line-height.

## First screen

Show schema import first. Sizing, high availability, pipeline history, and Copilot are all on the first screen. The job of that screen is to get a schema in. Leave the rest one step away.

## Leave alone

Leave sound and haptics out. A privacy banner should settle with no bounce.
