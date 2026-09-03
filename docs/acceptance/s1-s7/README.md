# S1–S7 acceptance record

**Result:** PASS

**Run:** 2026-09-03, one continuous deterministic WebMCP workflow

**System:** Substrate on OHIF 3.12; deterministic DOM WebMCP harness

**Dataset:** the exact NLST current/prior series listed in `DATA_ATTRIBUTION.md`

This record closes the previously informal S1–S7 exercise. The executable run
is `extensions/substrate/src/acceptance/s1-s7.test.ts`; it registers the ten
production tool objects through `document.modelContext`, retrieves them from
that registered surface, and completes the whole sequence through those tools.
Human-only actions are inserted explicitly at their product boundaries. They
are not replaced with agent tools.

The live Chrome smoke check separately confirmed that the same ten tools are
registered on the local viewer and that S1 produces the 1×2 current/prior lung
hang. This executable run supplies the durable, repeatable evidence for the
entire sequence; it does not claim that its human fixtures are a usability
study.

| Scenario | Agent/WebMCP action | Human-only action | Assertion | Result |
|---|---|---|---|---|
| S1 | Hang 1×2, current + prior, axial, lung windows | — | Both exact series are assigned to stable viewport IDs | PASS |
| S2 | Navigate to the supplied start slice, then advance ten slices | Supplies the landmark/start position | Final navigation is slice 60; no pixels cross WebMCP | PASS |
| S3 | Read back two measurements and label them target 1/2 | Draws two bidirectional measurements | Only existing measurement IDs are accepted as sources | PASS |
| S4 | Copy each source to the prior by geometry | Adjusts one proposal; accepts both | Copies begin proposed/unaligned and become citable only after acceptance | PASS |
| S5 | Compare accepted pairs and assemble the report | Reviews the draft | Two labels compare; every drafted sentence cites measurements | PASS |
| S6 | Revise the sentence addressed by the open reply | Replies and remeasures | Only that sentence changes; the other is byte-for-byte unchanged | PASS |
| S7 | Request signature and return `pending` | Signs; exports SR/PDF; edits | Both files download; the edit makes the signature stale; stale exports still identify it | PASS |

## Boundary checks observed in the same run

- WebMCP registers exactly ten tools and keeps reads/writes annotated.
- No tool receives pixel data or agent-chosen measurement coordinates.
- Proposal placement requires a radiologist-authored source measurement.
- `request_signature` only opens a pending request; the human `sign` path is
  separate.
- DICOM SR and PDF export are human UI actions and are absent from WebMCP.

## Reproduce

```bash
yarn workspace @substrate/extension-substrate test:unit:ci \
  --runTestsByPath src/acceptance/s1-s7.test.ts --coverage=false
```

The broader unit suite and production typecheck/build remain the release gate.
