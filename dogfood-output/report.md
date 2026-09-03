# Substrate WebMCP dogfood report

## Summary

- Target: `http://localhost:3010/viewer?StudyInstanceUIDs=1.2.840.113654.2.55.302957049620416109572494829313844992999`
- Tested: 2026-09-03
- Environment: Codex in-app browser with the live WebMCP capability, plus an independent Chromium UI/a11y pass
- Scope: study discovery, viewport navigation/display/layout, measurement safety, report review, SR/PDF export, activity UI
- Result: core local workflow passes; 3 product issues resolved, with 1 upstream
  OHIF warning and 1 Codex download-delivery limitation remaining

## Issues

### ISSUE-001 — WebMCP cannot discover the visible prior study

- Status: Resolved
- Resolution: empty startup inventories are no longer cached. `get_study`
  discovers the same-patient prior through DICOMweb metadata, and Full prep
  loads it at the write boundary.

- Severity: High
- Category: Functional
- Area: Study context / longitudinal workflow
- Evidence: [issue-001-prior-visible.png](screenshots/issue-001-prior-visible.png)
- Repro video: N/A — the defect is a stable discrepancy between visible viewer state and returned tool state.

#### Steps to reproduce

1. Open the target study in the Codex in-app browser.
2. Observe that the left study browser contains both the 2001 current study and a 2000 prior study.
3. Fetch the page's WebMCP tools and call `get_context({})`.
4. Call `get_study({})`.
5. Repeat both calls.

#### Expected

The agent context exposes the visible prior study/timepoint and its series so the advertised current/prior hanging workflow can be executed.

#### Actual

`get_context` consistently returns `prior_timepoints: 0`, `studies_open: 1`, and only `timepoints: ["20010102"]`. `get_study` returns only the 2001 study. The visible 2000 prior is absent from the agent-facing model, making the core compare-with-prior workflow unavailable through WebMCP.

---

### ISSUE-002 — Activity history obscures diagnostic pixels

- Status: Resolved
- Resolution: the activity control is a docked one-line rail. The rail exposes
  only current state, current object, and at most one decision; settings,
  report review, three recent bursts, timing, and diagnostics use progressive
  disclosure.

- Severity: Medium
- Category: UX / Layout
- Area: Agent activity panel
- Evidence: [issue-002-result.png](screenshots/issue-002-result.png)
- Repro video: [issue-002-repro.webm](videos/issue-002-repro.webm)

#### Steps to reproduce

1. Open the viewer.
2. Select the agent activity control at the bottom of the viewport.

#### Expected

Activity history docks outside the diagnostic image area or reflows the viewport without occluding pixels.

#### Actual

The history panel expands upward over a substantial portion of the CT image.

---

### ISSUE-003 — Secondary Substrate copy fails text contrast

- Status: Resolved
- Resolution: required secondary copy uses `ink/low`; the failing empty-state
  sentence was removed, and the research label is now a terse, titled `RUO`
  mark rather than an instruction.

- Severity: Medium
- Category: Accessibility
- Area: Activity panel / application footer
- Evidence: [issue-001-prior-visible.png](screenshots/issue-001-prior-visible.png)

#### Steps to reproduce

1. Open the viewer and expand agent activity.
2. Run an automated WCAG contrast audit.

#### Expected

Informational text meets WCAG AA contrast (4.5:1 for this text size).

#### Actual

“Changes made by the agent will appear here.” and “Research use only” render as `#62666d` on `#0f1011`, approximately 3.3:1.

---

### ISSUE-004 — Viewer emits a React prop-type error during startup

- Severity: Low
- Category: Console / Reliability
- Area: Viewer initialization
- Repro video: N/A — console-only startup diagnostic.

#### Steps to reproduce

1. Open the target viewer URL in a fresh browser session.
2. Inspect the console after initial load.

#### Expected

The viewer initializes without React validation errors.

#### Actual

The console reports: `Invalid prop config supplied to App, expected one of type [function]`.

---

### ISSUE-005 — Codex in-app browser silently cancels both generated exports

- Severity: High
- Category: Functional / Integration
- Area: DICOM SR and PDF export delivery
- Evidence: [issue-005-export-dialog.jpg](screenshots/issue-005-export-dialog.jpg)
- Repro video: N/A — browser download records provide the decisive evidence.

#### Steps to reproduce

1. Draft a report through the live WebMCP `draft_report` tool.
2. Call `request_signature`.
3. In the human review dialog, accept each unsupported sentence, acknowledge the agent-authored text, enter a test signer, and sign.
4. Select **Export DICOM SR**, then **Export PDF**.
5. Inspect the Codex in-app browser download records.

#### Expected

The signed DICOM SR and PDF are delivered to the user, or the UI reports why delivery is unavailable.

#### Actual

Both export generators run and advertise concrete payload sizes, but Codex's in-app browser cancels delivery silently. Two repeated runs produced a 2,992-byte `application/dicom` payload and a 2,163-byte `application/pdf` payload; all four browser download records have an empty target path, zero received bytes, state `2`, and interrupt reason `40`. The signed dialog remains open with no error or explanation.

This may be an in-app-browser integration limitation rather than a generator defect, but it blocks the exact Codex + WebMCP workflow under test.

## Passing checks so far

- Live WebMCP capability is discoverable in the Codex in-app browser and exposes 10 tools.
- `navigate` moved the active viewport to the requested slice and produced an attributed viewport label.
- `set_display` applied the bone preset and recorded a write action.
- Read calls stayed out of visible action history.
- `propose_measurement` rejected a request without a source measurement using `NEEDS_SOURCE` and a useful recovery hint.
- `list_measurements` and `compare_with_prior` returned valid empty-state payloads without inventing findings.
- `hang_layout` successfully created and reported a 1×2 layout when given loaded series identifiers, then restored 1×1.
- Full prep opened from a single-study URL, discovered the 2000 prior, waited
  for OHIF's viewport-ready event, produced a 1×2 current/prior hang, applied
  lung windows to both panes, created the report draft, and recorded a 3-second
  prepared run without a runtime error overlay.
- Invalid slice, preset, and series requests returned structured `SLICE_OUT_OF_RANGE`, `NO_SUCH_PRESET`, and `NO_SUCH_SERIES` errors with recovery hints.
- `draft_report` flagged every unsupported sentence and preserved the draft hash/version.
- `request_signature` returned pending without signing; the human dialog kept Sign disabled until every required review control and signer name was completed.
- A post-signature draft change marked the old signature stale and set `signed: false` in WebMCP context.
- Fresh signed exports generated deterministic DICOM and PDF payloads (2,992 and 2,163 bytes respectively), but delivery failed as described in ISSUE-005.
