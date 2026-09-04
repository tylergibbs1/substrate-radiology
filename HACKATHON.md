# What changed for the WebMCP Challenge

This document separates the pre-existing OHIF viewer from the Substrate work created during the OpenAI WebMCP Challenge submission period.

## Pre-existing work

[OHIF/Viewers](https://github.com/OHIF/Viewers) supplies the medical image viewer, DICOMweb integration, Cornerstone rendering, measurement tools, viewport grid, extension system, and native viewer interface. OHIF is available under the MIT License.

Substrate does not claim these upstream capabilities as hackathon work. Judges should evaluate the WebMCP extension and its connected workflow surfaces.

## Work added during the submission period

The first Substrate commit, `1446baea2d`, is dated September 2, 2026. It registers the WebMCP tool surface and adds an OHIF mode. Commits dated September 2 and 3 add the following work:

- Ten WebMCP tools with schemas, annotations, validation, and error contracts
- Compatibility handling for the current draft API and Chrome's testing implementation
- Lifecycle-safe transactional registration and cancellation
- Current and prior study discovery through DICOMweb metadata
- Viewport hanging, navigation, display presets, and undo boundaries
- Human-authored measurement organization and safe cross-timepoint proposals
- Comparison and report drafting from accepted evidence
- Human-only review, signature, DICOM SR export, and PDF export
- A compact agent activity panel and transient viewport presence signal
- Deterministic WebMCP acceptance coverage and production unit tests
- A hosted Railway topology with a read-only DICOMweb edge
- Two attributed, de-identified National Lung Screening Trial series

Use this command to inspect the dated history:

```bash
git log --since="2026-08-25" -- \
  extensions/substrate \
  modes/substrate \
  platform/app/public/config/substrate.js \
  platform/app/public/config/substrate-railway.js \
  deploy seed scripts/seed-orthanc.py
```

## WebMCP boundary

The new agent surface begins at [`extensions/substrate/src/webmcp`](extensions/substrate/src/webmcp). The implementation calls `document.modelContext.registerTool` and gives agents structured metadata and workflow actions.

The tools do not return image pixels. They do not accept agent-selected measurement coordinates. They cannot accept proposals, sign reports, or export reports. Those actions remain in OHIF's human interface.

## Evaluation links

- [Live application](https://substrate.grayhavenindustries.com/viewer?StudyInstanceUIDs=1.2.840.113654.2.55.302957049620416109572494829313844992999)
- [Implementation contract](SUBSTRATE.md)
- [S1 through S7 acceptance record](docs/acceptance/s1-s7/README.md)
- [Demo data attribution](DATA_ATTRIBUTION.md)
- [Demo video](https://youtu.be/WcEev2iTRRo)
