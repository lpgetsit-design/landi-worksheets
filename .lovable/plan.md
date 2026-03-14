

# Updated Plan: Black & White Design System

The branding will be minimal black-and-white, matching Lovable's aesthetic — clean surfaces, no color accents except for destructive actions and focus rings.

## Design Changes from Previous Plan

- **Remove "ceramic" and "cobalt" references** — all surfaces are pure white (light) or near-black (dark)
- **No colored accents** — buttons, links, and interactive elements use foreground/background contrast only
- **Selection Spark toolbar**: black buttons on white, white on black in dark mode
- **AI chat panel**: no blue pulse — use subtle `muted` background for streaming tokens
- **Dark mode toggle** in header using the existing shadcn Switch or a sun/moon icon button

## CSS Variables (already close to what's in index.css)

Light mode stays as-is (white bg, dark text). Dark mode stays as-is. No custom brand colors needed — the existing shadcn slate palette is the design system.

## Typography

- **UI**: system font stack (Inter/Geist Sans if available, otherwise default sans)
- **Editor body**: serif font (Source Serif 4 or Georgia fallback) for comfortable reading — this is the only visual distinction

## Key Principles

1. Monochrome — color only for errors (destructive red) and focus rings
2. Thin borders (`border-border`)
3. Subtle shadows for elevation
4. Dark mode via `class` strategy (already configured in tailwind)
5. Toggle in header, preference persisted to localStorage

Everything else from the approved plan (phases 1-6) remains unchanged. The implementation will use the existing shadcn theme variables without adding new color tokens.

