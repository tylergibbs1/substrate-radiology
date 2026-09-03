# Substrate alpha release evidence

Captured from the local OHIF viewer on 3 September 2026. No hosted environment
was used.

## Host chrome and panel width

- [`host-theme-before.png`](./host-theme-before.png) shows stock OHIF chrome on
  the same study and viewport layout.
- [`host-theme-after.png`](./host-theme-after.png) shows the Substrate-scoped
  neutral host theme and the derived panel width.
- Browser measurement: the right panel is `320px` wide, up from OHIF's `280px`
  default.
- Computed-style audit: `0` visible elements retained the audited OHIF blue and
  navy values (`rgb(52, 140, 253)`, `rgb(9, 12, 41)`, or `rgb(5, 6, 21)`) after
  the scoped theme was applied; the same audit found `23` before it.

## Motion

- [`state-transition.mp4`](./state-transition.mp4) records the autonomy control
  changing from Full prep to Auto-prep and back in the live viewer. It also
  captures the fixed Recent work lanes while their relative timestamps update.
- Duration: `5.02s`.
- `prefers-reduced-motion: reduce` disables Substrate animation and transition
  rules.

## Build budget

The extension remains a single UMD product boundary. Its production artifact is
`259 KiB`, under the explicit `272 KiB` UMD budget. Crossing that measured budget
restores webpack's asset and entrypoint warnings.
