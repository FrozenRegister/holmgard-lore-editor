# HLE UI & Coding Style Guide

This document defines the conventions for maintaining visual and structural consistency across the Holmgard Lore Editor.

## 1. Design Tokens (CSS Variables)
Always prefer CSS variables over hardcoded hex values to support theme consistency.

| Variable | Usage | Default (Dark) |
| :--- | :--- | :--- |
| `--bg` | Primary background | `#1a1a1a` |
| `--bg-secondary` | Cards, list items, sidebars | `#2a2a2a` |
| `--bg-hover` | Hover states on interactive elements | `#333333` |
| `--accent` | Primary actions, active states, borders | `#4682B4` |
| `--text` | Primary body text | `#f0f4f8` |
| `--text-muted` | Labels, notes, secondary info | `#888888` |

## 2. Typography & Layout
*   **Readability**: For long-form text (lore entries, markdown), use a `max-width` of `70ch` to maintain comfortable line lengths.
*   **Semantics**: Use `<article>` tags for self-contained content blocks. Use `<section>` for logical groupings within a page.
*   **Spacing**: Use rem-based padding for containers (e.g., `padding: 1.5rem 2rem`) to ensure scaling consistency.

## 3. Svelte Component Patterns
*   **Scoped vs Global**: Use scoped styles by default. Use `:global(.prose img)` only when styling HTML injected via `{@html}`.
*   **Box Sizing**: Always set `box-sizing: border-box` in wrapper components to prevent padding from breaking layout dimensions.

## 4. Legacy JavaScript (`static/hexmap/`)
When working in the legacy IIFE-based files (like `river-edges.js` or `game.js`):
*   **Initialization**: Use a polling interval to wait for `window.state.hexMap` to be ready before running `init()`.
*   **State Access**: Always use a helper like `function hm() { return window.state && window.state.hexMap }` to safely access the map state.
*   **DOM Injection**: When injecting UI into the legacy canvas view, use `absolute` positioning and high `z-index` (e.g., 99-9999).

## 5. Markdown Rendering
Content rendered via `marked` should be wrapped in a `.prose` class with the following standard overrides:
*   **Code Blocks**: `background: rgba(0, 0, 0, 0.05)`, `padding: 1rem`, `border-radius: 4px`.
*   **Tables**: `width: 100%`, `border-collapse: collapse`.
*   **Images**: `max-width: 100%`, `height: auto`.

## 6. Git Commit Messages
Follow the Conventional Commits specification:
*   `feat:`: New features.
*   `fix:`: Bug fixes.
*   `docs:`: Documentation changes.
*   `style:`: Changes that do not affect the meaning of the code (white-space, formatting, etc).
*   `refactor:`: Code changes that neither fix a bug nor add a feature.