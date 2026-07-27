---
name: shadcn-ui
description: Give the AI assistant deep knowledge of shadcn/ui components, patterns, and best practices. Activate when a components.json file is present or when working with shadcn/ui components.
---

# shadcn/ui

Use this skill when building with shadcn/ui. It provides project-aware context for finding, installing, composing, and customizing components using the correct APIs and patterns for the project.

## Project context

When this skill applies, run `shadcn info --json` from the project root. Use its output to identify the framework, Tailwind version, aliases, base library (`base`, `radix`, or `aria`), icon library, installed components, and resolved paths before proposing code.

Read `components.json` when it is present. Do not assume a shadcn/ui setup exists when it is absent.

## Workflow

1. Inspect the project configuration with `shadcn info --json`.
2. Discover the required component or pattern with `shadcn docs`, `shadcn search`, or the shadcn MCP registry tools before writing code.
3. Add components through the CLI where appropriate, then compose and customize them with the project’s existing conventions.
4. Follow the APIs for the configured base library and use semantic color tokens rather than hard-coded palette values.

## Composition guidance

- Use `FieldGroup` for forms.
- Use `ToggleGroup` for option sets.
- Prefer semantic colors and the configuration’s icon library.
- Preserve the existing CSS-variable theme, dark-mode approach, border-radius tokens, and component variants.
- For Tailwind v3 and v4, follow the project’s installed version rather than mixing patterns.

## CLI reference

Use the shadcn CLI commands appropriate to the task: `init`, `add`, `search`, `view`, `docs`, `diff`, `info`, and `build`. Prefer dry-run mode and smart merge workflows when modifying existing components. Support presets and templates when the user requests them.

## Registry and MCP

For custom registries, follow the `registry.json` item format, including item types, files, dependencies, CSS variables, build, hosting, and user configuration. Use the shadcn MCP server to search, browse, and install registry components when it is configured.

## Sources

- CLI: https://ui.shadcn.com/docs/cli
- MCP: https://ui.shadcn.com/docs/mcp
- Theming: https://ui.shadcn.com/docs/theming
- Registry: https://ui.shadcn.com/docs/registry
