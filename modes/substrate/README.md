# Substrate mode

A thin integration layer over OHIF's longitudinal viewer. It reuses the native
viewer route, layout, measurement tracking, toolbar, hanging protocol, and
validation behavior, then adds Substrate WebMCP registration and teardown to
the viewer lifecycle.

The Substrate application configuration loads this mode as an explicit
replacement for `@ohif/mode-longitudinal`, leaving exactly one `/viewer` route.
The mode owns its Substrate extension dependency, so adding the mode is the only
runtime configuration required; OHIF registers the extension before entering
the viewer.
Configurations that do not load Substrate retain OHIF's normal viewer without
any routing or lifecycle changes.
