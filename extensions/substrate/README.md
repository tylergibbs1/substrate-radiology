# Substrate

An agent-native radiology workflow, as an OHIF extension.

The radiologist reads. The agent does everything around the reading: hanging the
study and its priors, navigating, keeping measurements organized, matching
lesions across timepoints, and assembling a report where every sentence points
at a measurement a person made.

The agent cannot interpret an image. That is enforced by the shape of the tool
surface rather than by asking it nicely: no tool returns pixel data, no tool
takes coordinates the agent chose, and no tool records a finding.

`src/webmcp/spec.ts` is the only file that touches `document.modelContext`.
`src/webmcp/viewerTools.ts` is the tool surface, and its descriptions are
product copy — an agent picks tools from them alone.

## Human gate and export

The agent can request signature review but cannot sign or export. The receipt
shows the exact report, its measurement provenance, unsupported and unreviewed
sentences, signer attestation, and the canonical SHA-256 digest. After the
radiologist signs, the receipt exposes two human-only downloads:

- a DICOM Part 10 Comprehensive 3D SR with narrative, measurement provenance,
  verifying observer, attestation, and digest;
- a paginated PDF with selectable text, evidence rows, signature state, digest,
  and research-use footer.

Changing the report after signing makes the signature stale. Both formats say
so rather than silently presenting the old signature as current.

## Activity surface

The viewer shows one compact state line along the bottom edge. It expands into
proposal decisions and prose summaries of write bursts; reads and raw tool
names stay in the browser's Site tools panel. Successful viewport writes use a
single transient frame pulse and caption. The UI uses dark, hairline-separated
surfaces with one functional action accent and no persistent status glow.
