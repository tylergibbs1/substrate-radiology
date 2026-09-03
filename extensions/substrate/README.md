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
