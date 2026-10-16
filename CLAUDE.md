# JudYa app — rules for Claude Code

JudYa is a Thai, phone-first PWA for managing medicine at home. The owner is not a programmer: reply in simple Thai, never ask them about git.

Read `docs/BRIEF.md` before any work. It is the approved spec for milestone M3 (screens, data model, architecture, acceptance criteria, decisions Q1–Q12). Do only the step you were asked to do (3.1, 3.2 …). If the brief does not cover something, stop and ask — do not guess.

- Source of truth for UI: the design canvas linked in the brief. Do NOT use the UI, screen specs, screen pictures or AGENTS.md of the old repo `MonPlayPark/JudYa`; only `reference/calc.mjs` + tests may be reused.
- Never put real people's names or real medicine data in code, tests or docs. This repo is public.
- Storage key `judya.v2` only. Never read, change or delete other localStorage keys.
- Work on a branch, open a PR, never merge. Commit one logical change at a time; English commit messages.
- At the end of every session update `docs/HANDOFF.md`.

## Commands and layout
- `npm test` (Vitest), `npm run build` (strict type check + Vite build), `npm run dev`. Run both test and build before every PR.
- `src/domain/` pure logic (calc, zod schema, storage). No UI code in there. `src/pages/`, `src/components/` UI. Styles use the CSS variables in `src/styles/tokens.css` (Design System v2); do not invent colours or sizes.
- No `any`. Smallest text 15px, tap targets at least 48px, status never by colour alone (icon + word).
- Decisions made while building and open questions: `docs/DECISIONS.md`.
