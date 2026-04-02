# Release Notes: AI v1 Layer

## Included In This Layer
- Reminder/start copy tightened to "one message = one action".
- Returning and reactivation paths reduced to short next-step UX.
- Help converted to two layers (quick overview -> details).
- Coaching templates updated for low SFI, fire overload, all skipped, recovery.
- AI pilot added only for coaching question wording.
- Transparent user copy added about AI limits.

## Not Included (Next Layer)
- Partner mechanics.
- Platform-wide architecture rework.
- AI expansion beyond coaching pilot.

## E2E / Regression Checklist
- [ ] `/start` (new user) -> short intro -> start action works.
- [ ] `/start` (returning user) -> short path to today/planning works.
- [ ] Morning reminder -> single CTA opens today checklist.
- [ ] Midday reminder -> single CTA opens today checklist.
- [ ] Evening reminder -> single CTA opens day close flow.
- [ ] Reactivation reminder -> return path opens today checklist.
- [ ] Day close -> status marking -> summary works.
- [ ] Coaching question appears with answer/skip buttons.
- [ ] Coaching fallback works when `AI_ENABLED=0`.
- [ ] Coaching AI mode works when `AI_ENABLED=1` and API key set.
- [ ] Help short screen -> details screen navigation works.
- [ ] Main menu callbacks from matrix work end-to-end.
