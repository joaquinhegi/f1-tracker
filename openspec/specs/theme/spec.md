# Theme Specification

## Purpose

Light and dark themes with a System / Light / Dark toggle. The page paints without a flash, persists the viewer's choice, and follows the OS live in System mode.

Sources: `web/src/shared/theme/theme.ts`, `web/src/shared/ui/hooks/use-theme-mode.ts`, `web/src/shared/ui/containers/ThemeToggle*.tsx`, `web/src/shared/ui/molecules/ThemeToggle.tsx`, `web/src/shared/ui/styles/tokens.css`, `web/src/app/layout.tsx`.

## Requirements

### Requirement: Theme modes

The viewer MUST be able to choose `system` (the default), `light` or `dark` from a segmented control of native radios with a "Theme" legend. `system` MUST resolve to `dark` when `(prefers-color-scheme: dark)` matches and to `light` otherwise, including when `matchMedia` is unavailable. The resolved theme MUST be applied as `data-theme` and `color-scheme` on `<html>`.

#### Scenario: Explicit choice overrides the OS
- GIVEN the OS prefers dark
- WHEN the viewer picks Light
- THEN `<html data-theme="light">` is painted

### Requirement: Persistence

An explicit `light` or `dark` choice MUST be stored in localStorage under `f1-tracker:theme`. Choosing `system` MUST clear the key. Any other stored value MUST read as `system`. When storage is missing, full or blocked (even reading `window.localStorage` throws), the toggle MUST still work for the current page view without being remembered. Changes MUST propagate across tabs.

#### Scenario: Storage blocked
- GIVEN localStorage access throws
- WHEN the viewer picks Dark
- THEN the page turns dark and the choice is lost on reload

#### Scenario: Tampered value
- GIVEN `f1-tracker:theme` holds `"purple"`
- WHEN the page loads
- THEN the mode is `system`

### Requirement: No flash on load

An inline script in the root layout's `<head>` MUST resolve the mode and set `data-theme` and `color-scheme` before the first paint. It uses the same rules as the pure functions and survives blocked storage and a missing `matchMedia`. `<html>` MUST set `suppressHydrationWarning`, because those attributes differ from the server HTML by design. The client hook MUST paint from the live snapshot, not the server's `system`, so hydration does not undo the script. The toggle MUST load client-only, behind a same-size placeholder.

#### Scenario: Stored dark, first paint
- GIVEN `f1-tracker:theme` is `dark`
- WHEN the HTML is parsed
- THEN `<html>` is dark before any React code runs

### Requirement: Live OS follow

In `system` mode, the page MUST repaint when the OS preference changes, without a reload. It MUST support the legacy `addListener` API. In an explicit mode, OS changes MUST be ignored.

#### Scenario: OS switches to dark at sunset
- GIVEN mode `system` and the page open in light
- WHEN the OS preference flips to dark
- THEN the page repaints dark

### Requirement: Token parity

Every colour token MUST exist in both the dark and the light block of `tokens.css`. `SURFACE_COLOUR` in JS MUST equal each theme's `--color-surface` (`#161B22` dark, `#FFFFFF` light). Colours computed in JS, such as radio sender names, MUST be computed for both surfaces and selected in CSS. The viewport `theme-color` MUST match each theme's background (`#f6f8fa` light, `#0f1115` dark).

#### Scenario: New token added to one theme only
- GIVEN a colour token defined only in the dark block
- WHEN the test suite runs
- THEN the token parity test fails

## Known limitations

- The viewport `theme-color` follows the OS preference, not an explicit override.
