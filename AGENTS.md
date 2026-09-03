# Repository instructions

Before changing Substrate product UI, read `DESIGN.md` completely. Treat its
semantic tokens, state vocabularies, copy rules, component boundaries, and
definition of done as requirements. Change a recurring decision in `DESIGN.md`
and `extensions/substrate/src/designTokens.ts` before changing individual
consumers.

Do not generalize one-off interface elements. Do not add a measurement,
review, or session state without first changing the canonical state set.

Preserve OHIF behavior outside the Substrate extension. The agent may operate
workflow but must never receive pixels, invent measurement coordinates,
interpret an image, accept a proposal, sign, or export.
