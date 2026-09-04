---
version: alpha
name: Substrate
description: A darkroom instrument for reading medical images alongside an agent. Pure black room, a neutral grey ladder with no colour in it at all, and a single violet signal that belongs to the agent and to nothing else. The accent is tuned to survive both ends of a windowed CT, which is the only constraint that mattered. All type is one weight; hierarchy comes from size and tracking. No shadows, no gradients, no eyebrows, no all-caps. The agent is a 6px lamp and a 2px ring, never a persona.
colors:
  surface: "#040404"
  surface-bed: "#101014"
  surface-card: "#1c1c1c"
  surface-inset: "#2a2a2a"
  surface-raised: "#383838"
  line-strong: "#464646"
  on-surface: "#ffffff"
  on-surface-muted: "#d8d8d8"
  on-surface-dim: "#7b7b7b"
  primary: "#ffffff"
  on-primary: "#1c1c1c"
  host-tooltip-ink: "#ffffff"
  signal-mark: "#8b76ff"
  signal-stroke: "#6d52ff"
  on-signal: "#ffffff"
  error: "#eb5757"
typography:
  headline-md:
    fontFamily: Inter Tight
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.14px
  body-lg:
    fontFamily: Inter Tight
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.13px
  body-md:
    fontFamily: Inter Tight
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.018px
  body-sm:
    fontFamily: Inter Tight
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.016px
  ui-md:
    fontFamily: Inter Tight
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  data-md:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.23
    letterSpacing: -0.26px
    fontFeature: "'tnum' 1"
rounded:
  none: 0px
  inner: 8px
  outer: 20px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 20px
  xl: 24px
  card: 40px
  section: 48px
  room: 80px
components:
  panel-route:
    main: work
    secondary: details
    header: fixed
    content: scrollable
    footer: fixed
    statusLane: 104px
    statusTime: compact-relative
    scrollbarGutter: stable
    detailsSections: activity, preferences, timing, connection
  panel-shell:
    headerHeight: 44px
    tabTarget: 44px
    tabMark: 32px
    content: contained
  recent-work:
    default: expanded
    summary: count
    maxRows: 6
    rowHeight: 36px
    order: oldest-to-newest
    fullHistoryOrder: oldest-to-newest
    overflow: sliding-window
    fadeRows: 2
  connection-row:
    stateLane: 14ch
    labelOverflow: ellipsis
    stateWrap: nowrap
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.outer}"
    padding: "{spacing.card}"
  viewport:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.outer}"
    padding: "{rounded.none}"
  lamp:
    backgroundColor: "{colors.signal-mark}"
    rounded: "{rounded.full}"
    size: 6px
  lamp-unsupported:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.signal-mark}"
    rounded: "{rounded.full}"
    size: 6px
  presence-ring:
    borderColor: "{colors.signal-stroke}"
    rounded: "{rounded.outer}"
    size: 2px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.inner}"
    padding: 9px 20px
  button-ghost:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    borderColor: "{colors.on-surface-dim}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.inner}"
    padding: 7px 12px
  button-ghost-hover:
    borderColor: "{colors.on-surface-muted}"
  button-primary-disabled:
    backgroundColor: "{colors.on-surface-dim}"
    textColor: "{colors.on-surface-muted}"
  arrow-send:
    backgroundColor: "{colors.signal-mark}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.inner}"
    size: 40px
  input-line:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    borderColor: "{colors.on-surface-dim}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    padding: 0px 0px 12px 0px
  input-line-focus:
    borderColor: "{colors.on-surface-muted}"
  citation:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.data-md}"
  hairline:
    backgroundColor: "{colors.on-surface-dim}"
    height: 1px
  measurement-table:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.data-md}"
---

# Substrate Design System

## Overview

Substrate is read in a dim room by one person who is looking at something
else. The images are the subject; the interface is the bench the images sit
on. Everything here follows from that.

The room is pure black and every interface surface above it is a neutral
grey with no chroma at all. There is exactly one colour in the product, a
violet that belongs to the agent: a 6px lamp, a 2px ring, one 40px arrow.
When it appears, the eye finds it immediately, because it is the only
chromatic thing on the screen.

The accent was chosen by measurement, not by taste. It has to stay visible on
a study whose luminance the radiologist changes with a window preset, which
means against near-black lung and near-white bone in the same image. Working
back from that, the ideal accent luminance is about 0.168, and the best worst
case any colour can reach is 4.05. Violet at `#6d52ff` reaches 4.00. A light
accent cannot: a lime reaches 1.01 against bright bone, which is
indistinguishable from white.

The voice is a lab notebook, not an application. One type weight. Sentence
case. No labels announcing what a thing is when the thing already says it.
An agent works here alongside the reader, and it announces itself with light
rather than with words.

## Colors

The ladder is five levels, and depth comes from the step between them rather
than from a shadow or a border.

| Level | Token | Value | Purpose |
|---|---|---|---|
| 0 | `surface` | `#040404` | The room. Every surface sits on it. Not pure black: on an OLED reading monitor `#000000` clips to panel-off, which turns the step to the bed into an on-off edge rather than a step. |
| 1 | `surface-bed` | `#101014` | The ground under the images. One whisper of a step off the room, so bright pixels stay dominant. |
| 2 | `surface-card` | `#1c1c1c` | Panel and sheet. The one interface surface. |
| 3 | `surface-inset` | `#2a2a2a` | A group inside a panel. Replaces a border. |
| 4 | `surface-raised` | `#383838` | A question or a sheet over a panel. The only level that overlaps another. |
| — | `line-strong` | `#464646` | Never a surface. The top of the hairline scale, so `surface-raised` has a strong rule available. |

Adjacent steps run 1.080, 1.114, 1.187, 1.224, widening as they rise. Every
level is chroma zero. A tinted surface under a chromatic accent is two hues
quietly disagreeing, and the accent is the only thing in this product allowed
to have an opinion about colour.

Hairlines derive from the ladder, never from a fixed grey, and there are two
weights because one is not enough. A row separator inside a group and the
group's own boundary cannot be the same value, or they compete.

**Quiet** is one level up. Separates peers: rows in a list, sentences in a
section, steps in a plan. On `surface-card` that is `surface-inset`, a ratio
of 1.19.

**Strong** is two levels up. Separates regions: the head of a panel from its
body, a footer from what it closes. On `surface-card` that is
`surface-raised`, a ratio of 1.45. `line-strong` exists so that
`surface-raised` has a strong rule available; it is a hairline value and never
a surface.

A hairline is therefore always one step or two, and it never has to be tuned
per surface. If a boundary needs more than strong, it is not a boundary, it is
a change of surface.

- **On-surface (#ffffff):** Sentences, headings, the reader's own words.
- **On-surface-muted (#d8d8d8):** Measurements, citations, technical
  readouts, resolved steps.
- **On-surface-dim (#7b7b7b):** Placeholders, disabled states, steps not yet
  reached, and the only grey light enough to carry small text on every level
  of the ladder: 4.35 on `surface-card`, 3.39 on `surface-raised`.
- **Primary (#ffffff) on On-primary (#1c1c1c):** The one filled action per
  surface. Light on dark; the reverse of the surface it sits on.
- **Host tooltip ink (#ffffff):** OHIF reuses its primary-foreground token for
  both filled-button text and tooltip titles. Substrate separates the tooltip
  title at the host boundary so it is 14.35:1 on `surface-inset`; supporting text
  stays `on-surface-muted`.
- **Signal-mark (#8b76ff):** The agent, on an interface surface. Solid marks
  only: the lamp, the arrow, the active pill. 5.38 on `surface-card`.
- **Signal-stroke (#6d52ff):** The agent, on an image. Thin strokes only: the
  2px presence ring, the 1px ring of an unsupported lamp. Tuned to the
  measured optimum, 4.00 worst case across a windowed CT. A thin stroke reads
  lighter than a solid field at the same value, which is why these are two
  values of one hue. Never both in one element.
- **Error (#eb5757):** Failure only. Never used for status, never for
  emphasis. It sits at almost exactly the accent's luminance, 1.02 between
  them, so colour cannot separate the two and is not asked to: an error mark
  is a filled square where the agent's mark is a circle. Shape carries it.

Design in monochrome. Color appears only where it carries meaning that
nothing else can, and it is always paired with a non-color cue. Proposed
against confirmed is dashed against solid. Unreviewed is the lamp as a ring
instead of a fill. Neither depends on hue, so neither depends on the reader
seeing hue.

## Typography

Inter Tight is the single sans, standing in for PP Neue Montreal, which is
licensed. Geist Mono sets the identifier, never the sentence around it, and
needs no substitute. A sentence naming a
slice stays in sans with only the number in mono; a table of measurements is
mono throughout because every cell is an identifier.

- **headline-md (24px):** Section headings and the reader's stated intent.
- **body-lg (22px):** The attestation, and the intent input. The largest
  text on a surface is whatever the reader is about to commit to.
- **body-md (18px):** Report sentences, summaries, prose in a sheet.
- **body-sm (16px):** Secondary prose.
- **ui-md (13px):** Dense panel text and button labels.
- **data-md (13px Geist Mono, tabular):** Measurements, deltas, hashes, window and
  level readouts, slice numbers. Tabular figures are required wherever a
  value changes in place, so a ticking number never reflows the line around
  it.

One weight, 400, everywhere. Hierarchy is size, line-height compression, and
tracking that tightens as size grows. Nothing is bold, nothing is italic,
nothing is uppercase.

Equivalent peers share role, size, weight, line-height, and numeric
treatment. Never resize one because its string is longer or its value is
larger. If two things genuinely need different treatment, they are not peers;
rank them or group them so the geometry matches the argument.

### Two systems, named

Two densities coexist by design, and only two. Each is a named system with a
scope rule, so a violation is a fact rather than an opinion.

**Bench.** Every docked surface: the panel, the status strip, proposal rows,
the plan, history, viewport readouts, and every inline question. Runs at
ui-md and data-md only. A radiologist scans Bench while looking elsewhere.
Use Bench nowhere else.

**Plate.** The signature sheet, and nothing else today. Runs at body-md,
body-lg, and headline-md. It is read rather than scanned, and it is the only
place the editorial scale appears. A surface that is docked does not get
Plate, whatever it contains. A future full-attention surface may adopt Plate
only if it takes the whole screen and no images are being judged on it.

## Layout

Content columns cap at 720px on a surface and 1200px in the room. The scale
is 4px-based.

### Every gap has one owner

A container sets the gap; its children do not add margins. When a group is
built in page-owned CSS, reset the margins of its direct children and let the
container's `gap` own the rhythm. Two sources for one gap is a defect, and it
is never repaired with a one-off margin on the element that looks wrong.
Repair the grouping or the owner.

### Meaning and identity are separate acts

A signature carries two things, and they do not merge. The affirmation states
that the reader reviewed the report and takes responsibility for it. The
identity states who they are. Collapsing them, so that typing a name
completes the sentence, reads well and removes the wrong half: when a passkey
later supplies the identity, the typed name becomes decoration and nothing is
left carrying the meaning.

The affirmation is its own act, and it stays. The name field is provisional.

### Reach

Minimum interactive target is 44 by 44px, measured on the hit area rather
than the paint. Small marks keep their drawn size and grow their target with
a pseudo-element:

    .lamp { position: relative; }
    .lamp::after {
      content: ""; position: absolute;
      inset: -19px;               /* 6px mark to a 44px target */
    }

This applies to the lamp, the citation link, the undo control, the disclosure,
and every ghost button under 44px tall. A 6px lamp that jumps to its
measurement with a 6px target is a defect, not a minimal design.

### Rhythm is relationships, not one value

- Heading to its first line: close.
- Line to line, or line to list: one body rhythm.
- Lamp to citation, value to detail: identical across every peer.
- Group to a new group: clearly larger.
- Surface to surface in the room: largest.

Within a group, `sm` through `base`. Between groups, `xl` through `card`.
Between sections of a card, `section`. `room` is the gap between surfaces and
never the default stack value.

Judge the whole transition, not the token. A large gap beside a short or
underfilled group compounds emptiness even when the token is correct. Reduce
the gap, rebalance, or stack until the open space has a purpose. Open space
should amplify the thing it surrounds; a large empty rectangle is a layout
failure, not restraint.

Nothing floats over the images. Panels dock. A collapsed panel leaves a
single row of state anchored below the image grid, never over it. Overlays
exist only for the signature, which is the one moment the images are not
being judged.

## Elevation & Depth

Flat. There are no shadows anywhere in the product, and no gradients on any
interface surface. Depth is the step from black room to ink card, plus 1px
hairlines. A gradient near the images would read as image content, and a
shadow implies a floating panel, which this product does not have.

The only gradient permitted is the radial falloff inside an empty viewport,
which is scaffolding for absent pixels and disappears when a study loads.

## Shapes

Three radii, and no others: `inner` 8px, `outer` 20px, `full`.

Outer radius equals inner radius plus padding. A card at `outer` 20 with 12px
padding holds an `inner` 8 group exactly, and that arithmetic is why the
padding is 12 rather than 16. Viewports take `outer`, the same as cards, so
images read as plates on a bench. Buttons, groups and inline questions take
`inner`. Lamps and pills are `full`.

A group whose corner is tighter than the card holding it is the mismatch that
reads as slightly wrong without being nameable. Check the arithmetic before
adding a fourth value.

Hairlines are 1px and horizontal only. Never thicker, never dashed, never
vertical, never doubled.

## Repeated evidence

Any set of repeated rows carrying a value is sized as one layout, never row by
row. Give the set one label lane, one plot or value lane, and one lane for
each aligned annotation. Every track starts and ends on the same grid lines;
only the fill or the value varies. A row whose label length changes the
position of its value is a layout failure. Use a parent grid or shared fixed
tracks rather than content-sized columns resolved independently inside each
row. This governs the measurement table now and the sum-of-diameters bars
across timepoints later.

Tables are evidence:

- A column header matches the alignment of every cell beneath it. Labels left,
  numbers right, including totals and placeholders.
- Body cells align to the row's first text baseline, never centered, even when
  one cell wraps.
- The label column is wide enough that ordinary short labels stay on one line.
  Never wrap a label while a sibling column holds unused width.
- Never spend a column repeating one category down a run of rows. Group the
  rows instead.
- Peer units and precision are consistent. No fake precision.

## Components

- **Panel route:** The docked panel has two views, `work` and `details`. Work
  contains agent state, findings/report, suggested measurements, and recent
  work. One `Details` row at the bottom enters the secondary view. Details owns
  Preferences, Timing, and Connection beneath a Back/Details header. Disclosure
  state survives navigation between the two views. Both views use three owned
  regions: a fixed header, independently scrollable content, and, when the view
  has a route action, a fixed footer. The status line never scrolls away and the
  Details route never drifts with clinical content. The state mark and verb own
  a fixed `104px` lane, measured to hold `Waiting for you`, and every scrolling
  region reserves its scrollbar gutter before it is needed. State changes and
  expanding disclosures therefore cannot move adjacent text. Safety boundaries
  are enforced by behavior and do not occupy the panel as explanatory copy.
- **Panel shell:** In Substrate mode, OHIF's right-panel chrome is part of the
  same dock rather than a separate toolbar. It has one `44px` header containing
  the collapse control and `44px` tab targets with `32px` inset marks. The
  header has one strong bottom rule; black tab spacers and the second separator
  are removed. The active tab uses `surface-inset`, never signal. The panel body
  owns the remaining height with `min-height: 0` and cannot create a second
  page-height scroll surface. Other OHIF modes keep their native panel shell.
- **Recent work:** Completed writes use one expanded disclosure labelled by
  count: `2 recent actions`. It reveals at most 6 compact tool rows, ordered
  oldest to newest so the live edge stays at the bottom. The full Activity
  history uses the same chronological order. Once more than
  6 actions exist, the 2 oldest visible successful rows step down in opacity;
  no gradient is introduced. A new row enters at the bottom and retained rows
  move upward as a 180ms sliding window. Failed rows remain at full contrast.
  Each row keeps the shared lamp, action, Undo, and time lanes. `View all
  activity` opens the complete write history under Details. The disclosure is
  open by default so recent actions remain directly auditable. Running work
  remains in the state line and plan. Reduced-motion users receive the same
  window without translation or fading transitions.
- **Connection row:** Diagnostic tool rows use one shared `14ch` state lane.
  The tool title truncates with an ellipsis and exposes its full value on hover;
  `Read`, `Write`, and `untrusted` never wrap. The state lane is evidence, not a
  badge, and stays neutral.
- **Card:** Ink surface, 20px radius, 40px padding, no border, no shadow.
  Takes one shape option, `raised` or `flush`. Flush drops the radius and the
  padding so the same content can render inside a host container, which is
  how the panel sits in OHIF's side panel without becoming a second
  component.
- **Viewport:** Black, 16px radius. Nothing is drawn inside the image
  bounds. The presence ring rides the frame.
- **Lamp:** 6px round signal. Filled means present; a 1px ring with a hollow
  center means absent. This is the entire status vocabulary.
- **Button (primary):** White fill, ink text, 8px radius, sentence case. One
  per surface.
- **Button (ghost):** Transparent with a dim hairline border, brightening to
  muted on hover. Every other action.
- **Arrow send:** 40x40, the only signal fill larger than 6px, holding an
  ink arrow. It commits an intent.
- **Input line:** No box. A single bottom hairline that brightens on focus.
  Text sits at body-lg, so typing is the largest thing on the surface.
- **Citation:** Mono, muted, underlined with a dim rule. It is a jump to the
  measurement, not a label describing one.
- **Measurement table:** Mono, tabular figures, hairline rows, no header
  row. Prior and current are joined by an arrow, which makes a header
  unnecessary.

## Do's and Don'ts

- Do carry hierarchy with size and tracking. Weight 400 is the whole system.
- Do keep the signal at 6px lamps, a 2px ring, and one 40px arrow.
- Do use `signal-mark` on interface surfaces and `signal-stroke` on images,
  and never mix the two in one element.
- Do keep every surface at chroma zero. The accent is the only colour.
- Do check outer equals inner plus padding before choosing a radius.
- Do write sentence case, verbs first, and let content speak for itself.
- Do give every write an undo, and keep what was removed visible and
  restorable rather than deleting it.
- Do use tabular figures for every number that changes in place, so a
  ticking value never reflows the line around it.
- Do give every gap exactly one owner, and express rhythm as a relationship
  rather than as one stack value.
- Do give every interactive mark a 44px target, however small it is drawn.
- Do let the reader own the scroll position during a run.
- Do show what a standing instruction has done, not only what it says.
- Do hold a transient failure for two seconds before showing it.
- Do name the system a surface belongs to, Bench or Plate, before choosing a
  type size.
- Do size repeated rows as one layout with shared lanes, so a long label can
  never move a value.
- Do lift an interactive disclosure to `surface-inset` on hover and keyboard
  focus so its hit area is visible without adding another border.
- Do keep preparation opinionated: Full prep is the default, and the only
  user-facing mode exception is `Ask before changes` under Details >
  Preferences. Auto-prep remains an engine state, not a daily sidebar choice.
- Do keep viewer preparation independent of agent connection. WebMCP failure
  changes Connection state only; it never gates the comparison hang, display
  presets, or the viewer itself.
- Don't add eyebrows, section counters, all-caps labels, or attribute names
  in front of values. If a row needs a word to explain what it is, the row
  is wrong.
- Don't fill anything larger than 40px with the signal, and never put text
  on it.
- Don't use a second accent. State is shape and light, not hue, and the error
  colour is close enough to the accent in luminance that it could not be a
  second accent even if the rule allowed one.
- Don't draw a border where a step up the ladder would say the same thing.
- Don't use one hairline weight for both peers and regions.
- Don't set the room to pure black.
- Don't set text in a surface value, or a surface in a text value.
- Don't apply shadows or interface gradients.
- Don't say "AI" in the interface. The agent's suggestions are "suggested."
- Don't let any surface float over the images.
- Don't wrap a single write in a summary, a plan, or a group.
- Don't build a composer, a tool list, or a call count. The browser has them.
- Don't leave a hue anywhere in the host chrome.
- Don't show the strip and the panel at the same time.
- Don't put Preferences, Timing, or Connection disclosures in the work view.
  They live one level down in Details and keep their disclosure state when the
  reader returns.
- Don't merge the affirmation into the signer field.
- Don't load a typeface from a third-party origin. Bundle it, because the
  reading network will not reach one.
- Don't put the signal on the signing action. The agent cannot sign, so it
  must not wear the agent's color.

## Known gaps

Stated so that a reader of this file knows where it stops.

- No light mode. The reading room is dim and the system does not describe a
  light theme.
- Leader lines for overlapping targets on an image are unsolved. Labels sit in
  a lane at the frame edge, which works until two targets need the same line.
- `error` and the accent cannot be separated by colour, so shape carries the
  distinction. If a third state ever needs a colour, this system has no answer
  for it.
- Nothing here describes the worklist, the study list, or anything before a
  study is open.
- The neutral host theme maps OHIF's semantic theme variables while Substrate
  mode is mounted. New host tokens must enter that map before they ship.
- Motion outside the presence signature is limited to the 180ms state-copy
  transition and the 180ms Recent work sliding window. Other transitions remain
  local until they recur.

The docked panel is `320px`. That is the smallest width that holds the widest
real history row at Bench type without moving its fixed lanes: `32px` combined
OHIF and component padding on each side, a `6px` lamp, three `12px` gaps, a
`120px` minimum action lane, a `32px` Undo lane, and an `8ch` time lane. OHIF
may let the reader widen it, but Substrate mode must not let it collapse below
that measured width.

## Changing this system

A change to any surface ships with a before and an after image. A change that
depends on motion, timing, or a transition ships with a short recording of it
running. A value that claims a contrast, a luminance, or a target size ships
with the number that was measured, not the number that was intended.

## The host's chrome

Substrate runs inside a viewer that has its own theme, and the stock theme is
blue: the toolbar, the icons, the active tool, the active viewport edge, and
the patient chip. Measured against the accent, those hues sit 28 to 37 degrees
away, which is the same family to a glancing eye. An accent that is the only
colour in the product is not the only colour on the screen, and the premise
collapses.

Substrate mode therefore ships a neutral host theme. Every hue in the toolbar,
the icon set, and the viewport chrome goes to chroma zero, and the active
states are carried by the ladder: a selected tool is `surface-inset`, an
active viewport edge is `line-strong`. Nothing in the host is allowed a hue.
Tooltip titles use `host/tooltip-ink`, never OHIF's shared
`primary-foreground`, because the latter is dark for Substrate's filled
buttons.

This is not a preference about the viewer's taste. Any accent, in any hue,
fails the same way if the chrome around it is chromatic, because the eye
finds the rarest colour and there is no rarest colour when everything is
tinted.

## What the site does not build

The browser already supplies the place a person types to the agent, the list
of tools the site exposes, and the read and write counts. Building any of
those again inside the panel produces a second, worse copy of something the
reader already has.

So there is no composer in this product. A prompt arrives from the browser's
own surface, and the panel reports what happened to the study. The standing
instructions list is the exception that proves the rule: it is site data,
authored in the site, and no tool can read or write it.

## Accountability

An agent cannot be held accountable. That is the reason for every boundary in
this system, and it is why the signal never touches the signing action: the
agent can propose the sentence, and only a person can answer for it.

It follows that every object the agent touched names two parties, not one.
The lamp names the agent. The report names its signer. In a single-reader
study the second is implicit; in a teaching read, where a resident's agent
proposes and an attending co-signs, it must be on the object. An agent with
work attributed to it and no visible human owner leaves a reader with nothing
to disagree with.

## Agent presence

The agent has one identity and it is light. It is never an avatar, never a
name in a chat bubble, never a persona.

- **Ring.** On a write, a 2px signal ring rides the affected viewport's
  frame: 150ms in, 600ms hold, 400ms out. Once per burst, showing the final
  state. Never inside the image bounds.
- **Caption.** The effect name stays in the docked state line or collapsed
  status strip: `slice 78`, `lung window`. The viewport frame carries no text
  chip because every exterior edge belongs to adjacent viewer chrome and no
  interior edge may cover pixels.
- **No persistent viewport mark.** When the ring ends, the viewport returns to
  neutral. Attribution remains in Recent work rather than as a dot beside the
  image.
- **Lamp.** The same 6px mark, without motion, is the author label wherever
  the agent wrote something. Filled when a measurement stands behind the
  sentence; a ring when none does.
- **Reads are silent.** Only writes are announced.
- Under `prefers-reduced-motion`, the ring appears and disappears without
  animation. Motion is never the only channel; the state line and Recent work
  carry the same write in text.

## Standing instructions

Standing instructions are not a preference field. They are a list the reader
builds over months, and each one is an artifact with a history.

Every instruction is its own row carrying a mark, its text, the number of
times it has fired, and when it was written. A count is the evidence that an
instruction became a real part of how someone reads: one that has fired 148
times is a hanging protocol its author never had to write in code, and one
that has fired three times in a month is a preference that did not survive
contact with the work.

Pausing is not deleting. A paused instruction keeps its history, so a reader
can stop one for a difficult case and resume it without rebuilding what it
knew. Deleting is a separate, quieter action.

Rows share lanes, so a long instruction can never move a count. The panel
states how many are running and how many of those are layout only, because
layout instructions run whether or not an agent is connected.

## Autonomy

Full prep is the product, not a mode the reader has to choose. There is no
autonomy selector in the work view or Details. The engine retains 3 levels so
its behavior can be tested precisely, but `auto-prep` is never user-facing.

Full prep is a viewer workflow, not a WebMCP side effect. It runs from the
mode lifecycle whether tool registration succeeds, fails, or remains pending.
Connection failure may say `Blocked`, but it must not cancel, hide, resize, or
otherwise disturb the study. WebMCP registration has its own cancellation
lifecycle so cleaning up a partial tool surface cannot abort viewer work.

When a multi-image current/prior comparison is hung, the hang places each
stack at its metadata midpoint once using OHIF's native initial-image option
and verifies the resulting index before it reports success. This avoids
presenting an empty boundary frame without inspecting pixels or claiming an
anatomical landmark. After that opening placement, scroll belongs entirely to
the reader unless they explicitly ask the agent to navigate.

Details > Preferences contains one exception: `Ask before changes`. Off means
Full prep. On means Assist. At Assist, the question appears inline in the
docked panel, or in the status strip while that panel is collapsed, with the
choices stated as actions rather than as yes and no. A viewer-write question
never overlays the viewport it concerns. Elsewhere the write happens and the
undo is offered.

## Live surfaces

A run emits writes over minutes while the reader is doing something else.
These rules govern what the interface may do to them without being asked.

### Scroll belongs to the reader

A panel follows new entries only while it is already at the bottom. The
moment the reader scrolls up, following stops, and it does not resume until
they return to the bottom themselves. New entries arriving off screen are
announced by a count, never by a jump. Nothing scrolls the reader's view
during a run.

### The strip is the collapsed state

The status strip and the panel never appear together. The strip exists so
that a collapsed panel still reports state; when the panel is open it owns
the state line and the strip is gone. A strip beside an open panel shows the
same status twice and offers to open something already open.

### Stop exists from the moment the agent is committed

Stop appears when the request is sent, not when the first write lands. The
gap between those two is the window a reader is most likely to change their
mind, and it is the one window where the agent is committed and the interface
looks idle.

### Transient failures wait before they speak

A failed call holds for two seconds before it surfaces. A reconnect, a slow
archive, or a retried request that recovers inside that window never appears
at all. An error that reaches the reader is one the run did not recover from,
because a red mark that flashes and clears teaches the reader to ignore red
marks.

### One action is not a burst

Coalescing exists for a run of writes. A single write is stated directly, in
past tense with its parameter, with no summary wrapper, no plan card, and no
group. A summary that summarises one thing is longer than the thing.

### State copy changes without snapping

When status or activity copy changes in place, the replacement fades in over
180ms with at most 2px of vertical travel. The container keeps its dimensions;
text never animates layout. Reduced-motion users receive an immediate
replacement. Relative time is instrumentation: it updates in place with
tabular figures and no motion. This transition is for semantic changes, not
clocks or static history rows.

## Copy

Words are content, not decoration. Name things as the reader would.

Never use: intelligent, smart, powerful, robust, seamless, effortlessly,
instantly, automatically, magic, simply, just, AI. Each either claims the
agent understood something, which it did not, or claims ease on the reader's
behalf.

Prefer: suggested, proposed, confirmed, cited, uncited, drafted, matched,
stopped, left out. Concrete verbs for concrete acts.

Specificity is the trust signal. Use numerals for every quantity, always:
`42 mm`, `2 proposals`, `14s ago`, `3 of 4`. Never spell a number out, and
never replace one with a word like several, many, or a few.

- Every step is a verb, a parameter, and a result, in that order. Not
  `Hanging`, but `Hanging · current and prior`, resolving to
  `Hung · current and prior · 1 by 2`. A step without its parameter is
  decoration, because it cannot be audited.
- State what happened in one sentence with links, not a list of calls.
- Present tense only for the step currently running; everything finished is
  past tense.
- An empty surface offers the next action: "Label a target to propose it on
  the prior."
- A failure says what happened and what to do, in the interface's voice.
- Numbers state consequences: "4 statements, 1 with no measurement behind
  it," not "1 error."
