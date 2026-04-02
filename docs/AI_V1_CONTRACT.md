# AI v1 Contract

## Scope
- AI v1 is enabled only in one pilot: evening coaching question generation.
- All other flows remain deterministic/rule-based.

## Inputs
- Day metrics: `total`, `done`, `skipped`, `pending`, `sfi`, `fireDone`.
- Product policy prompt from `src/services/ai/prompts.js`.

## Output
- One short reflective question in Russian.
- Limit: concise, actionable, no long explanations.

## Guardrails
- Hard timeout (`AI_TIMEOUT_MS`, default 7000 ms).
- Retry cap (`AI_RETRIES`, default 1).
- Feature flag (`AI_ENABLED=1` to enable).
- If API key missing/error/timeout -> fallback to deterministic template.

## Safety
- No autonomous task edits.
- No hidden decisions: user always sees normal explicit buttons.
- AI output is text-only suggestion, user keeps full control.
