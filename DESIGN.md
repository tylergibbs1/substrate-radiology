# Substrate design decisions

This file is the source of truth for product design decisions shared by people,
agents, code, and recorded demos. The purpose is not visual consistency for its
own sake. It is to make each recurring decision once so nobody makes it again in
a component.

## Product context

- Audience: radiologists and research readers working in a dark reading room.
- Job: let an agent handle workflow around image interpretation while the
  radiologist remains the primary actor, confirms measurements, and signs.
- Character: a midnight precision instrument—quiet, compact, deterministic,
  and attributable. Never decorative technology theater.

## Semantic tokens

The runtime values live in
`extensions/substrate/src/designTokens.ts`. Use these names in design notes,
code review, implementation prompts, and the video.

| Name | Decision |
|---|---|
| `agent/mark` | One circle-to-loop mark. It morphs only while the agent is working and rests as a loop for authorship. |
| `agent/accent` | One agent color. Nothing else may use it. |
| `action/primary` | The one human commit action: Apply, Accept, Keep, Sign, or primary export. |
| `action/primary-hover` | Hover state for the primary action. |
| `action/primary-press` | Pressed state for the primary action. |
| `on/primary` | Text on the primary action. |
| `state/proposed` | Dashed measurement; not report evidence. |
| `state/confirmed` | Solid measurement; human-confirmed evidence. |
| `state/unaligned` | Proposal geometry needs human adjustment. |
| `review/unreviewed` | Not yet reviewed by the radiologist. |
| `review/accepted` | Explicitly accepted. |
| `review/rejected` | Explicitly rejected. |
| `review/stale` | Changed after the decision or signature. |
| `session/idle` | No work in flight. |
| `session/working` | A write is in flight. |
| `session/waiting-for-you` | A confirmation, proposal, reply, or signature needs a person. |
| `session/done` | The requested burst completed. |
| `session/error` | The requested change failed. |
| `autonomy/assist` | Every workflow write waits for an in-site human decision. |
| `autonomy/auto-prep` | Workflow writes run; proposals and signing still wait for the human. Default. |
| `autonomy/full-prep` | The same boundary as Auto-prep, plus deterministic prep on study open. |
| `surface/room` | Viewer-room near-black. |
| `surface/panel` | Agent and review surfaces. |
| `border/hairline` | The only structural edge. |
| `ink/high` | Primary text and the object currently under review. |
| `ink/mid` | Default interface text. |
| `ink/low` | Secondary text that must remain readable. |
| `ink/dim` | Nonessential metadata; never instructions or required state. |
| `motion/enter` | 150 ms. |
| `motion/exit` | 100 ms. |
| `motion/presence` | The viewport pulse; the only long motion. |
| `text/ui` | 12–13 px interface text. |
| `text/measure` | Tabular numerals for measurements, dates, slices, and hashes. |

There is no fourth measurement state and no additional session state. Additions
require changing this decision before changing a component.

The autonomy level is chosen only in the UI. It never changes the safety
boundary: no level exposes pixels, invents coordinates, accepts a proposal, or
signs. At Assist, a pending workflow write is an `elicitation` and the canonical
choices are Apply and Skip.

The collapsed agent rail contains one status, one object, and at most one
decision. Settings, report review, history, timing, and diagnostics are disclosed
inside the expanded surface and never repeat the same completed plan.

## Components worth systematizing

Systematize only repeated things with states, an actual rule, and an owner:

- plan card;
- summary entry;
- proposal row;
- elicitation card.

Do not generalize the panel header, empty states, or About text. They occur once
and have no reusable state model.

## Copy

- Sentence case.
- Verbs first.
- No exclamation marks.
- Never say “AI” in the interface.
- Say “Suggested,” never “generated.”
- Say “Waiting for you,” never “Action required.”
- Finished work is past tense. Only the action in flight is present progressive.
- Product history never exposes raw tool names or reads.
- A review reply belongs to one report sentence. An agent answer replaces only
  that sentence, preserves the thread beneath it, and marks the exact reply it
  answered; it never redraws the whole report over a human comment.

## Motion and attribution

Only writes animate. While a write is in flight, the agent mark may morph from
a circle to a loop and cycle terse working verbs. At rest it is a static loop;
it never shimmers. Coalesce a burst into one final effect. The 2 px viewport
frame uses `agent/accent`, enters in `motion/enter`, holds long enough to be seen
peripherally, and exits in `motion/exit`. Nothing glows, shimmers, or remains lit.
Reduced motion uses a fade. The same `agent/mark` labels authored objects without
motion.

## Definition of done

- A radiologist can complete scenarios S1 through S7 without the mouse.
- The panel never shows a tool name.
- The first visible feedback after a prompt is under 300 ms.
- Every agent-authored thing carries `agent/mark`.
- The state line is never wrong about whether the agent is waiting on the human.
- Nothing on screen would surprise someone reading Linear's Agent Interaction
  Guidelines for the first time.

When the implementation drifts, fix the decision here and its semantic token,
then update every consumer. Do not patch one screen with a local substitute.
