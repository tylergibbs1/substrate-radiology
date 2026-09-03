# S1–S7 acceptance record

**Result:** PASS

**Run:** 2026-09-03, one continuous deterministic WebMCP workflow

**System:** Substrate on OHIF 3.12; deterministic DOM WebMCP harness

**Dataset:** the exact NLST current/prior series listed in `DATA_ATTRIBUTION.md`

This record is deterministic contract evidence, not native-browser acceptance. The executable run is
`extensions/substrate/src/acceptance/s1-s7.test.ts`; it registers the ten production tool objects
through `document.modelContext`, discovers them with `getTools()`, invokes them through
`executeTool()`, parses its stringified JSON result, and completes the whole sequence through that
surface. Human-only actions are inserted explicitly at their product boundaries. They are not
replaced with agent tools.

A separate live Chrome smoke check confirmed only that the ten tools register and that S1 produces a
1×2 hang. It does **not** cover native `executeTool` argument/schema conversion, cancellation during
OHIF async layout work, Cornerstone postconditions, or S2–S7. Those require a recorded
native-browser run before release. The Jest harness uses production tool objects but mocked OHIF
services and synthetic metadata shaped around the attributed NLST UIDs; it is neither a clinical
dataset validation nor a usability study.

| Scenario | Agent/WebMCP action                                           | Human-only action                              | Assertion                                                                                | Result |
| -------- | ------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| S1       | Hang 1×2, current + prior, axial, lung windows                | —                                              | Both exact series are assigned to stable viewport IDs                                    | PASS   |
| S2       | Navigate to the supplied start slice, then advance ten slices | Supplies the landmark/start position           | Final navigation is slice 60; no pixels cross WebMCP                                     | PASS   |
| S3       | Read back two measurements and label them target 1/2          | Draws two bidirectional measurements           | Only existing measurement IDs are accepted as sources                                    | PASS   |
| S4       | Attempt exact-series geometry transfer                        | Measures the prior directly after safe refusal | Different FrameOfReferenceUIDs are refused; no raw coordinates are copied across frames  | PASS   |
| S5       | Compare accepted pairs and assemble the report                | Reviews the draft                              | Two labels compare; every drafted sentence cites measurements                            | PASS   |
| S6       | Revise the sentence addressed by the open reply               | Replies and remeasures                         | Only that sentence changes; the other is byte-for-byte unchanged                         | PASS   |
| S7       | Request signature and return `pending`                        | Signs; exports SR/PDF; edits                   | Both files download; the edit makes the signature stale; stale exports still identify it | PASS   |

## Boundary checks observed in the same run

- WebMCP registers exactly ten tools and keeps reads/writes annotated.
- No tool receives pixel data or agent-chosen measurement coordinates.
- Proposal placement requires a radiologist-authored source measurement.
- Proposal placement also requires an explicit target series and an identical, non-empty
  FrameOfReferenceUID; no registration transform is currently available.
- `request_signature` only opens a pending request; the human `sign` path is separate.
- DICOM SR and PDF export are human UI actions and are absent from WebMCP.

## Reproduce

```bash
yarn workspace @substrate/extension-substrate test:unit:ci \
  --runTestsByPath src/acceptance/s1-s7.test.ts --coverage=false
```

This harness passing is necessary but not sufficient. The broader unit suite, production
typecheck/build, and a native-browser evidence run remain the release gate.
