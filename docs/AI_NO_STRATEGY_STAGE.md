# Stage: AI for no-strategy branch (<= 4 hours)

## Goal
Add AI assistance only in `first_touch` branch `no_strategy`:
- input: goal + selected area + daily bandwidth
- output: strict list of 3-5 concrete next steps
- fallback: current deterministic template

## Scope (in)
- `src/bot/scenes/firstTouch.js` integration point after area+bandwidth selection.
- Reuse existing AI adapter (`src/services/ai/client.js`).
- New prompt builder for no-strategy branch.
- Output normalization (max 5 bullets, short actionable lines).
- Feature flag gate and safe fallback.

## Scope (out)
- No AI changes in planning/day-close/reminders beyond existing behavior.
- No DB schema changes.
- No expansion to other onboarding branches.

## Guardrails
- timeout/retry from AI client (`AI_TIMEOUT_MS`, `AI_RETRIES`).
- hard output cap: 3-5 steps.
- one-step-per-line format.
- if AI fails/empty/invalid -> use existing static guidance text.

## Deliverables
1. Prompt function for no-strategy quick plan.
2. Scene integration in `firstTouch` no-strategy final step.
3. Post-processing validator for AI response (bullets length and count).
4. Fallback path confirmed by test.

## Acceptance criteria
- User without strategy receives 3-5 concrete steps.
- Text never exceeds expected compact format.
- With `AI_ENABLED=0`, flow works exactly as before.
- With `AI_ENABLED=1` and API error, fallback is used automatically.

## Effort estimate
- Prompt + formatter: 1.0h
- Scene integration: 1.0h
- Guardrails + fallback handling: 0.8h
- Smoke checks + copy polish: 0.7h
- Buffer: 0.5h

Total: **4.0h**
