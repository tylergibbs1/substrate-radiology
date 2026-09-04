# Substrate

An agent-native radiology workflow, built as an extension to the OHIF viewer.

The radiologist reads. The agent does everything around the reading — hanging the
study and its priors, navigating, keeping measurements organised, matching lesions
across timepoints, and assembling a report where every sentence points at a
measurement a person made. The agent never interprets an image. The radiologist
signs.

**Research use only. Not for clinical diagnosis. Not FDA cleared.**

---

## The agent cannot interpret, and that is structural

This is the claim the whole design serves, so it is worth being precise about how
it is enforced. It is not a prompt asking the model to behave.

- **No tool returns pixel data.** Inputs and outputs are metadata, geometry,
  measurements and the human's own words.
- **No tool takes coordinates the agent chose.** `propose_measurement` takes a
  *source measurement id* and copies it. Without one it returns `NEEDS_SOURCE`.
  There is no path from "the agent thinks there is something at (x, y)" to a mark
  on the image.
- **A copy is not a measurement.** It is placed by geometry alone, renders amber
  and dashed, and is not citable. Only a person accepting it makes it evidence.
- **A report may only cite accepted measurements.** `draft_report` returns
  `NOT_ACCEPTED` if you try to cite a proposal nobody confirmed.
- **Only the modal can sign.** No tool mints a signature; `request_signature`
  merely opens the dialog and returns `pending`.

Ask the agent what it thinks a lesion is and nothing in the tool surface can
answer.

## WebMCP

Tools are registered in JavaScript on the top-level page in the extension's
`onModeEnter`, against a single `AbortController` that is aborted in
`onModeExit`. Registering a duplicate name throws `InvalidStateError`, so there
must never be two controllers alive at once.

```ts
// extensions/substrate/src/webmcp/spec.ts
const context = document.modelContext ?? navigator.modelContext
await context.registerTool(
  {
    name: 'propose_measurement',
    title: 'Copy a measurement onto another timepoint',
    description: '…',
    inputSchema: { type: 'object', required: ['from_measurement_id'], /* … */ },
    annotations: { readOnlyHint: false },
    // The context argument is OPTIONAL. An agent may call execute with one
    // argument, and destructuring the second would throw a TypeError that the
    // agent sees as an opaque failure with nothing to act on.
    execute: (input, options) => run(input, options?.signal),
  },
  { signal }
)
```

Registration failures are reported rather than swallowed: `SecurityError`
(untrustworthy origin), `NotAllowedError` (the `tools` permissions policy is
off), `InvalidStateError` (duplicate or malformed name) and `TypeError` (bad
schema) each surface in the banner with the reason, so a misconfigured browser
shows why instead of an empty panel.

### The ten tools

| Tool | Reads/writes | What it does |
|---|---|---|
| `get_context` | read | What is open, the timepoints, every viewport pane, the report and signature state |
| `get_study` | read | Discoverable current and prior series with modality, date and image count |
| `hang_layout` | write | Sets the grid and puts named series in each pane |
| `navigate` | write | Moves a pane to a slice, or to a measurement |
| `set_display` | write | Window/level presets and zoom reset, per pane |
| `list_measurements` | read | Everything measured, with proposal and citability state |
| `propose_measurement` | write | Copies a measurement onto another timepoint |
| `compare_with_prior` | read | Change between timepoints, from accepted measurements only |
| `draft_report` | write | Assembles findings; flags sentences citing nothing |
| `request_signature` | write | Opens the signature dialog. The only consequential action |

Read-only tools set `readOnlyHint: true`. Anything returning text somebody else
wrote sets `untrustedContentHint: true`.

### Two things the spec and the implementation disagree about

Recorded because both cost time and both fail opaquely:

- `executeTool`'s IDL says `executeTool(RegisteredTool, object inputObject)`, but
  Chrome's current implementation rejects an object and requires a **JSON
  string**. Passing an object returns `Failed to parse input arguments`.
- `getTools()` returns a **promise**, not an array.

## Running it

```bash
yarn install

# a local archive holding only the series the demo opens
docker run -d --name substrate-orthanc -p 8042:8042 \
  -e ORTHANC__DICOM_WEB__ENABLE=true \
  -e ORTHANC__AUTHENTICATION_ENABLED=false \
  -e ORTHANC__REMOTE_ACCESS_ALLOWED=true orthancteam/orthanc
python3 scripts/seed-orthanc.py

cd platform/app && OHIF_PORT=3010 yarn dev:substrate
```

Then open the current seeded study. Substrate discovers the same-patient prior
from DICOMweb metadata and loads it only when the layout asks for it:

```
http://localhost:3010/viewer?StudyInstanceUIDs=<follow-up>
```

For the agent side, Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.
In the ChatGPT desktop browser, site tools need GPT-5.6 Sol or Terra and are
unavailable in Enterprise or Edu workspaces.

The viewer works normally with no agent at all. `document.modelContext` being
absent costs you the tools and nothing else.

## What is real and what is seeded

**Real.** The imaging: NLST participant 122615, annual low-dose chest CT
screening rounds from the National Lung Screening Trial, via the NCI Imaging Data
Commons. De-identified and public. Both exact series were verified individually
as CC BY 4.0 in IDC's official index; the identifiers, source citation, license,
and bundled notice are in [`DATA_ATTRIBUTION.md`](DATA_ATTRIBUTION.md). The geometry, the measurements,
the propagation, the canonical hash and the signature binding are all real.

**Seeded.** Only which studies are loaded. Nothing about the clinical content is
invented, because nothing about it is asserted: the product never says what is in
the image.

**Implemented.** Signed reports export as a DICOM Part 10 Comprehensive 3D SR
and as a paginated, selectable-text PDF. Both carry the signer, attestation and
SHA-256 report digest; both visibly identify a stale signature after the report
changes. Export remains a human action inside the signed-report receipt rather
than an agent tool. The autonomy level and standing instructions are set only in
the viewer; Assist holds workflow writes for an explicit Apply or Skip decision,
Auto-prep carries out requested writes without opening-study preparation, and
`get_context` reports the level, instructions, and pending confirmations.
Opening a study does not run any preparation; the browser agent performs those
steps through WebMCP after the reader prompts it. Every workflow write has an undo boundary, the timing comparison records
by-hand and prepared runs, and report review supports sentence keep/remove,
threaded replies, exact-sentence revision, template changes, version restore,
signature staleness, and human-only export.

**Deferred by scope.** Deployment and the public judging URL are intentionally
not part of this local completion pass.

## Acceptance

The complete S1–S7 workflow is recorded as one executable WebMCP acceptance run
in [`docs/acceptance/s1-s7/README.md`](docs/acceptance/s1-s7/README.md). It keeps
the radiologist-only actions—drawing, adjusting, accepting, signing, and
exporting—outside the agent surface and verifies signature staleness after an
edit.

## How this differs

Existing viewer AI is model-shaped: it segments, or it generates a report from
the pixels. Substrate is agent-shaped. The measurements are the truth, they are
made or confirmed by a person, and the report is assembled from them rather than
generated. Agents that drive viewers today do it by actuation — Puppeteer and
`page.evaluate` against a UI that was never meant for them, which is slow,
brittle and blind to viewer state. Here the tool set is the viewer's own.

## Licence

OHIF is MIT and pre-existing. The Substrate extension
(`extensions/substrate/`), the Orthanc seeding script and the viewer config are
new work; see the commit history for what was added and when.
