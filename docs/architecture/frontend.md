# Frontend structure

The desktop renderer lives in `apps/desktop/src`. `App.tsx` selects a page and composes the workspace and shell widgets. It does not fetch data or implement download behavior.

```text
App → pages → widgets → components
                 ↓
              services → client → Tauri
```

| Directory                                                     | Responsibility                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/`                                                      | Compose the downloads, history, preferences and diagnostics screens from widgets.                                                         |
| `widgets/`                                                    | Connect service state and actions to component props and callbacks. Compose other widgets when a region needs its own client interaction. |
| `components/cards/`                                           | Shared `Card` surface, download cards, statistics cards and information cards.                                                            |
| `components/{ui,layout,forms,dialogs,downloads,diagnostics}/` | Reusable presentation. Render supplied models, emit callbacks and manage DOM behavior such as opening a native dialog.                    |
| `services/client/`                                            | Tauri commands/events, desktop availability, folder selection and clipboard access.                                                       |
| `services/{workspace,downloads,settings,diagnostics}/`        | State, subscriptions, actions, validation, unit conversion and presentation models.                                                       |
| `services/shared/`                                            | Formatting, errors, polling, timing and shared behavior constants.                                                                        |
| `types/`                                                      | UI contracts shared between services and presentation. Use type-only imports here.                                                        |
| `style.css`                                                   | All renderer styling, with design tokens at the top.                                                                                      |

Components receive everything through props. For example, `DownloadCard` receives an already formatted `DownloadCardModel` and reports `onAction(action, id)` or `onDetails(id)`. `DownloadsWidget` connects those callbacks to the workspace service. Components and pages never import services, including service hooks and formatting helpers. Services do not import widgets, pages or components.

`WorkspaceWidget` mounts `useWorkspaceController` once above the pages. Its context shares jobs, engine health, settings, search, filters, actions and dialogs across widgets. Page navigation therefore preserves search/filter state without creating more event subscriptions. Shared workspace subscriptions stop on unmount, including listeners whose registration finishes late. Details and diagnostics poll only while their widgets are mounted; collapsed download logs do not poll. Polling waits for each request to finish before scheduling another and ignores responses after cleanup.

## Styles

Use semantic classes such as `download-card`, `page-heading` and `button-primary`. Plain CSS replaces Tailwind. Colors, font family, font sizes, spacing, dimensions and effects are declared in the first `:root` block of `style.css`; declarations refer to them with `var(...)`. The primary font is `--primary-font`. Extend the token set when adding a shared visual value.

The stylesheet starts with a section index. Tokens are grouped by purpose: colors (subdivided by UI area), typography, spacing, dimensions, icon sizes, radii, effects and motion. Numeric scales run from small to large. Color names describe their role or state, such as `--color-button-primary-hover-surface` and `--color-engine-status-stale-text`. Component rules follow in labeled sections, with responsive layouts and reduced-motion overrides together at the end. Keep related selectors and state variants in the same section.

Inline styles are limited to data-dependent custom properties: `--progress` and `--piece-completion`. Responsive breakpoints remain literal media-query values at 1000px and 700px because CSS custom properties cannot be substituted into media queries.

## Adding a screen or behavior

1. Put client operations in `services/client/` and domain-specific state, mapping or validation in the corresponding service directory.
2. Create presentational components with typed props. Use the shared `Card` for card surfaces and `Dialog` for modal lifecycle.
3. Add a widget to connect services to those props and callbacks.
4. Compose the widget in a page and register the page in `App.tsx`.
5. Add tests under root `tests/desktop/`, matching component, widget or service ownership.

`pnpm check` enforces these import boundaries using TypeScript resolution, including aliases, re-exports, `require` and dynamic imports. It also rejects test implementations outside root `tests/`. Typechecking covers production and test projects separately. See [the test workspace](../../tests/README.md) for commands and Rust test wiring.
