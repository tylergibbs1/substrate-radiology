# Devpost submission copy

This page contains the text and links needed for the OpenAI WebMCP Challenge submission form.

## Project name

Substrate

## Tagline

A radiologist reads the images. A WebMCP agent handles the workflow around them.

## Description

Substrate adds a browser-native agent workflow to the OHIF medical imaging viewer. It helps a radiologist prepare a longitudinal reading without giving the agent access to image pixels or diagnostic authority.

Radiology workflow crosses viewer state that ordinary browser automation cannot reliably understand. The agent must know which study is current, which series belongs to a prior, what each viewport contains, which slice is open, which display preset applies, and which measurements a person accepted. WebMCP lets the viewer expose that state and those actions directly as structured tools.

Substrate registers ten tools with `document.modelContext.registerTool`. They let an agent discover studies, arrange viewports, navigate, set display parameters, list measurements, propose a human measurement on a compatible prior, compare accepted measurements, draft traceable findings, and request signature review.

The radiologist and agent have different responsibilities. The agent prepares and organizes the reading. The radiologist examines pixels, creates and confirms measurements, reviews findings, signs, and exports. No WebMCP tool returns pixels, accepts agent-selected coordinates, accepts a proposal, signs, or exports.

This creates a faster and more reliable experience than coordinate-based browser control. Every write calls the same OHIF command used by the interface, reports its result, appears in recent activity, and has an undo boundary. The report cites accepted measurements instead of unsupported model output.

Substrate extends the existing open-source OHIF viewer. The WebMCP extension, connected workflow, safety boundaries, tests, hosted infrastructure, and demo data configuration were added during the hackathon submission period. [`HACKATHON.md`](HACKATHON.md) documents that boundary with dated commit evidence.

## Submission links

- [Live application](https://substrate.grayhavenindustries.com/viewer?StudyInstanceUIDs=1.2.840.113654.2.55.302957049620416109572494829313844992999)
- [Public source repository](https://github.com/tylergibbs1/substrate-radiology)
- [Demo video](https://youtu.be/WcEev2iTRRo)

## Testing instructions

Open the live application in ChatGPT's in-app browser. Wait for the current chest CT to load, then prompt the agent:

> Put this chest CT next to last year's, use lung windows for both, and take both to slice 80.

The application requires no login. All images are de-identified public research data. The interface is for research demonstration only.
