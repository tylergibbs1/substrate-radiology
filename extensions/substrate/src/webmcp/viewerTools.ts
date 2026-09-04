import { findTargetSlice, placeProposal, type TargetInstance } from '../engine/place';
import { autonomy } from '../engine/autonomy';
import { token } from '../designTokens';
import { isCitable, reject as rejectProposal } from '../engine/proposals';
import {
  addVersion,
  clearReport,
  currentVersion,
  dismissRequest,
  openReplies,
  pendingRequest,
  requestSignature,
  restoreVersion,
  signature,
  signatureIsStale,
  type MeasurementSnapshot,
  type ReportEvidenceSnapshot,
  type Sentence,
} from '../engine/report';
import { observeTool as observeToolWithSession } from './observeTool';
import { createStudyInventory } from './studyInventory';
import { refuse, type JsonObject, type WebMcpTool } from './spec';
import { withInputValidation } from './validation';
import {
  acquiredOn,
  activeDataSource,
  CT_PRESETS,
  describeMeasurement,
  resolveViewerServices,
  viewportReady,
  type ViewerDependencies,
} from './viewerContext';

type VoiRange = { lower?: number; upper?: number };

const VOI_TOLERANCE = 1e-6;

function matchesWindowLevel(range: VoiRange | undefined, window: number, level: number) {
  if (typeof range?.lower !== 'number' || typeof range.upper !== 'number') return false;
  // Cornerstone uses DICOM's inclusive LINEAR VOI range. Convert the applied
  // range back to the user-facing window/level values instead of comparing it
  // with the non-inclusive center +/- width / 2 approximation.
  const appliedWindow = Math.abs(range.upper - range.lower) + 1;
  const appliedLevel = (range.lower + range.upper + 1) / 2;
  return (
    Math.abs(appliedWindow - window) <= VOI_TOLERANCE &&
    Math.abs(appliedLevel - level) <= VOI_TOLERANCE
  );
}

/**
 * The viewer tool surface.
 *
 * What is NOT here is the design. There is no tool that returns pixel data, no
 * tool that takes coordinates the agent chose, and no tool that records a
 * finding. The agent can hang a study, move around it, read back what the
 * radiologist measured, and assemble those measurements into a report. It
 * cannot look at the image and tell you what it sees, because nothing in this
 * file would let it.
 *
 * Descriptions are product copy. The agent picks tools from them alone, so each
 * one says when to use it, what changes on screen, and what it refuses. They
 * also deliberately avoid clinical verbs like "detect" or "diagnose", which
 * would both misdescribe the tool and draw a safety review that should be
 * spent on the signature instead.
 */

export function buildViewerTools(deps: ViewerDependencies): WebMcpTool[] {
  const { viewportGrid, displaySet, measurement, tracked, cornerstone } =
    resolveViewerServices(deps);
  autonomy.setViewportResolver(() => viewportGrid?.getState().activeViewportId);
  const inventory = createStudyInventory(displaySet, activeDataSource(deps));
  const trackedSeries = () => tracked?.getTrackedSeries() ?? [];
  const ensureActive = (signal?: AbortSignal) => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  };
  const observeTool = (
    name: Parameters<typeof observeToolWithSession>[0],
    affected: Parameters<typeof observeToolWithSession>[1],
    run: Parameters<typeof observeToolWithSession>[2]
  ) => observeToolWithSession(name, affected, run, deps.sessionSignal);
  const activeStudyUid = () => {
    const state = viewportGrid?.getState();
    const active = state?.activeViewportId;
    const uid = active ? state?.viewports.get(active)?.displaySetInstanceUIDs?.[0] : undefined;
    return uid ? (displaySet?.getDisplaySetByUID(uid)?.StudyInstanceUID ?? '') : '';
  };

  const getContext: WebMcpTool = {
    name: 'get_context',
    title: 'What is open, and what to do next',
    description:
      'Start here. Returns the study that is open, which prior timepoints exist, the ' +
      'current viewport layout, how many measurements the radiologist has made, and a ' +
      'suggested next step. It also names every viewport pane and what is showing in ' +
      'it, which is how you address a specific pane in navigate and set_display — ' +
      'without a viewport id those act on the active pane only. Read-only and safe to ' +
      'call at any time. It includes open human replies so a report revision can answer ' +
      'the right sentence. Call this before anything else so you are not guessing at ' +
      'what is on screen.',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: observeTool(
      'get_context',
      () => [],
      async () => {
        const state = viewportGrid?.getState();
        const currentStudyUid = activeStudyUid();
        const studies = await inventory.get(currentStudyUid);
        const measurements = measurement?.getMeasurements() ?? [];
        const suggested =
          studies.length === 0
            ? ['Open a study from the study list.']
            : measurements.length === 0
              ? [
                  'Call get_study to see the series and any priors.',
                  'Call hang_layout to put the current study and its prior side by side.',
                ]
              : [
                  'Call list_measurements to read back what the radiologist measured.',
                  'Call compare_with_prior once the same lesions are measured at both timepoints.',
                ];
        const timepoints = studies
          .map(study => study.studyDate)
          .filter(Boolean)
          .sort();
        // Name every pane. Without this an agent can only ever drive whichever
        // viewport happens to be active, which makes a side-by-side comparison
        // impossible to work in.
        const panes = state
          ? [...state.viewports.entries()].map(([viewportId, viewport], index) => {
              const uid = viewport.displaySetInstanceUIDs?.[0] ?? '';
              const shown = uid ? displaySet?.getDisplaySetByUID(uid) : undefined;
              return {
                viewport: viewportId,
                pane: index + 1,
                series_uid: shown?.SeriesInstanceUID ?? '',
                study_date: shown ? acquiredOn(shown) : '',
              };
            })
          : [];
        const version = currentVersion();
        const signed = signature();
        return {
          timepoints,
          panes,
          report: version
            ? {
                version: version.version,
                sentences: version.sentences.length,
                signed: signed !== null && !signatureIsStale(),
                signature_stale: signatureIsStale(),
                awaiting_signature: pendingRequest()?.status === 'pending',
              }
            : null,
          studies_open: studies.length,
          study_uid: currentStudyUid,
          prior_timepoints: Math.max(0, studies.length - 1),
          layout: state ? { rows: state.layout.numRows, cols: state.layout.numCols } : null,
          active_viewport: state?.activeViewportId ?? '',
          measurement_count: measurements.length,
          tracked_series: trackedSeries().length,
          autonomy_level: autonomy.getLevel(),
          standing_instructions: autonomy.getStandingInstructions(),
          pending_confirmations: autonomy.getPending().map(request => ({
            confirmation_id: request.id,
            tool: request.tool,
            summary: request.summary,
            viewport: request.viewportId ?? '',
          })),
          open_replies: openReplies().map(reply => ({
            reply_id: reply.replyId,
            sentence_id: reply.sentenceId,
            sentence: reply.sentenceText,
            text: reply.text,
            kind: reply.kind,
          })),
          suggested_next: suggested,
        };
      }
    ),
  };

  const getStudy: WebMcpTool = {
    name: 'get_study',
    title: 'The series in a study, and its priors',
    description:
      'Lists every series that is loaded, with modality, description, date and image ' +
      'count, grouped by study so you can tell the current study from its priors. ' +
      'Read-only. Returns metadata only — never image data. Use it to choose which ' +
      'series to hang.',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        study_uid: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description: 'Limit to one study. Omit to list every study that is loaded.',
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'get_study',
      () => [],
      async input => {
        const wanted = typeof input.study_uid === 'string' ? input.study_uid : '';
        const studies = (await inventory.get(activeStudyUid())).filter(
          study => !wanted || study.studyUid === wanted
        );
        if (studies.length === 0) {
          return refuse(
            'NO_STUDY_LOADED',
            wanted
              ? 'There is no discoverable study with that id.'
              : 'No study is open in the viewer.',
            'Call get_context to read the current study and available prior count.'
          );
        }
        return {
          studies: studies.map(study => ({
            study_uid: study.studyUid,
            study_date: study.studyDate,
            series: study.series.map(inventory.describe),
          })),
        };
      }
    ),
  };

  const listMeasurements: WebMcpTool = {
    name: 'list_measurements',
    title: 'What the radiologist has measured',
    description:
      'Returns every measurement in the viewer with its id, label, series, tool and the ' +
      'value as it appears on screen. Read-only. This is the only source of numbers for ' +
      'a report: you may quote these, and you may not derive measurements of your own. ' +
      'Use tracked_only to get only the ones on a series the radiologist is tracking.',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        tracked_only: {
          type: 'boolean',
          description: 'Only measurements on a series the radiologist has marked as tracked.',
        },
        timepoint: {
          type: 'string',
          minLength: 1,
          description: 'Limit to a study uid or study date. Omit for every timepoint.',
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'list_measurements',
      () => [],
      async input => {
        const series = trackedSeries();
        const displaySets = displaySet?.getActiveDisplaySets() ?? [];
        const timepoint = typeof input.timepoint === 'string' ? input.timepoint : '';
        const all = measurement?.getMeasurements() ?? [];
        const rows = all
          .map(entry => describeMeasurement(entry, series, displaySets))
          .filter(row => (input.tracked_only === true ? row.tracked === true : true))
          .filter(row => {
            if (!timepoint) return true;
            if (row.study_uid === timepoint) return true;
            const set = displaySets.find(entry => entry.StudyInstanceUID === row.study_uid);
            return set ? acquiredOn(set) === timepoint : false;
          });
        return { measurements: rows, count: rows.length };
      }
    ),
  };

  const navigate: WebMcpTool = {
    name: 'navigate',
    title: 'Move to a slice or to a measurement',
    description:
      'Scrolls a viewport. Give it a measurement_id to jump to where a measurement was ' +
      'made, or a slice_index to go to a specific image. Changes what is on screen ' +
      "immediately and is reversible by navigating back. Returns the viewport's " +
      'resulting position so you can confirm it went where you meant.',
    inputSchema: {
      type: 'object',
      properties: {
        viewport: {
          type: 'string',
          minLength: 1,
          description: 'Viewport id. Omit for the active one.',
        },
        measurement_id: {
          type: 'string',
          minLength: 1,
          description: 'Jump to the slice a measurement was made on, and frame it.',
        },
        slice_index: {
          type: 'integer',
          minimum: 0,
          description: 'Zero-based image index in the series.',
        },
        slice_location_mm: {
          type: 'number',
          description: 'Patient-space slice location in millimetres; nearest slice wins.',
        },
      },
      oneOf: [
        { required: ['measurement_id'] },
        { required: ['slice_index'] },
        { required: ['slice_location_mm'] },
      ],
      additionalProperties: false,
    },
    execute: observeTool(
      'navigate',
      input => (typeof input.measurement_id === 'string' ? [input.measurement_id] : []),
      async (input, signal, setUndo) => {
        const state = viewportGrid?.getState();
        const viewportId =
          typeof input.viewport === 'string' && input.viewport
            ? input.viewport
            : (state?.activeViewportId ?? '');
        if (!viewportId) {
          return refuse(
            'NO_VIEWPORT',
            'There is no viewport to move.',
            'Open a study first, then call get_context to read the active viewport id.'
          );
        }
        if (!state?.viewports.has(viewportId)) {
          return refuse(
            'NO_SUCH_VIEWPORT',
            `There is no viewport with id ${viewportId}.`,
            'Call get_context and use one of the pane viewport ids it returns.'
          );
        }
        const previousIndex = cornerstone
          ?.getCornerstoneViewport(viewportId)
          ?.getCurrentImageIdIndex?.();
        const restorePosition = () => {
          if (!Number.isFinite(previousIndex)) return;
          deps.commandsManager.runCommand('jumpToImage', {
            imageIndex: previousIndex,
            viewport: { id: viewportId },
          });
        };
        if (typeof input.measurement_id === 'string' && input.measurement_id) {
          const found = measurement?.getMeasurement(input.measurement_id);
          if (!found) {
            return refuse(
              'NO_SUCH_MEASUREMENT',
              'There is no measurement with that id.',
              'Call list_measurements to get current ids; they change when a measurement is deleted.'
            );
          }
          const shownUid = state.viewports.get(viewportId)?.displaySetInstanceUIDs?.[0];
          const shownSeries = shownUid
            ? displaySet?.getDisplaySetByUID(shownUid)?.SeriesInstanceUID
            : '';
          if (found.referenceSeriesUID && shownSeries !== found.referenceSeriesUID) {
            return refuse(
              'MEASUREMENT_NOT_IN_VIEWPORT',
              'That measurement is not on the series displayed in the requested viewport.',
              'Call get_context and choose the pane showing the measurement series.'
            );
          }
          ensureActive(signal);
          viewportGrid?.setActiveViewportId(viewportId);
          ensureActive(signal);
          measurement?.jumpToMeasurement(viewportId, input.measurement_id);
          setUndo?.(restorePosition);
          return { viewport: viewportId, jumped_to: input.measurement_id };
        }
        let targetIndex = typeof input.slice_index === 'number' ? input.slice_index : undefined;
        if (typeof input.slice_location_mm === 'number') {
          const displaySetUid = state?.viewports.get(viewportId)?.displaySetInstanceUIDs?.[0];
          const shown = displaySetUid ? displaySet?.getDisplaySetByUID(displaySetUid) : undefined;
          const candidates = (shown?.instances ?? []).map((instance, index) => ({
            index,
            location:
              instance.SliceLocation ??
              (instance.ImagePositionPatient?.length === 3
                ? instance.ImagePositionPatient[2]
                : Number.NaN),
          }));
          const nearest = candidates
            .filter(candidate => Number.isFinite(candidate.location))
            .sort(
              (a, b) =>
                Math.abs(a.location - Number(input.slice_location_mm)) -
                Math.abs(b.location - Number(input.slice_location_mm))
            )[0];
          if (!nearest) {
            return refuse(
              'NO_SLICE_LOCATIONS',
              'This series has no patient-space slice locations.',
              'Use slice_index instead.'
            );
          }
          targetIndex = nearest.index;
        }
        if (typeof targetIndex === 'number') {
          if (!(await viewportReady(cornerstone, viewportId))) {
            return refuse(
              'VIEWPORT_NOT_READY',
              'That viewport is still being built, so nothing was moved.',
              'Wait a moment and call navigate again; hanging a layout takes a second to settle.'
            );
          }
          ensureActive(signal);
          // jumpToImage wants the grid viewport object and reads `.id` off it,
          // so passing the id as a string lands as undefined and throws
          // "Unsupported viewport type" from deep inside Cornerstone.
          try {
            deps.commandsManager.runCommand('jumpToImage', {
              imageIndex: targetIndex,
              viewport: { id: viewportId },
            });
          } catch (error) {
            return refuse(
              'SLICE_OUT_OF_RANGE',
              error instanceof Error ? error.message : 'That slice does not exist in this series.',
              'Call get_study for the image_count of the series, and use a zero-based index below it.'
            );
          }
          const resultingIndex = cornerstone
            ?.getCornerstoneViewport(viewportId)
            ?.getCurrentImageIdIndex?.();
          if (Number.isFinite(resultingIndex) && resultingIndex !== targetIndex) {
            restorePosition();
            return refuse(
              'NAVIGATION_NOT_APPLIED',
              `Viewport ${viewportId} did not reach slice ${targetIndex}.`,
              'The prior position was restored; wait for the viewport and try again.'
            );
          }
          setUndo?.(restorePosition);
          return {
            viewport: viewportId,
            slice_index: targetIndex,
            slice_location_mm:
              typeof input.slice_location_mm === 'number' ? input.slice_location_mm : null,
          };
        }
        return refuse(
          'NOTHING_TO_DO',
          'Give a measurement_id, slice_index, or slice_location_mm.',
          'Use measurement_id to show the radiologist a measurement you are citing.'
        );
      }
    ),
  };

  const setDisplay: WebMcpTool = {
    name: 'set_display',
    title: 'Window, level and orientation',
    description:
      'Applies a window/level preset such as lung, soft tissue, bone or brain, or resets ' +
      'zoom and pan. Changes what is on screen immediately and is reversible by applying ' +
      'another preset. It changes how the image is displayed and never what it contains.',
    inputSchema: {
      type: 'object',
      properties: {
        viewport: {
          type: 'string',
          minLength: 1,
          description: 'Viewport id. Omit for the active one.',
        },
        preset: {
          type: 'string',
          enum: [...CT_PRESETS.keys()],
          description: 'A window/level preset name, for example lung, soft tissue, bone, brain.',
        },
        reset_zoom_pan: { type: 'boolean', description: 'Reset zoom and pan to the default.' },
        invert: { type: 'boolean', description: 'Set image inversion on or off.' },
        orientation: {
          type: 'string',
          enum: ['axial', 'coronal', 'sagittal'],
          description: 'MPR orientation: axial, coronal, or sagittal.',
        },
      },
      anyOf: [
        { required: ['preset'] },
        { required: ['reset_zoom_pan'] },
        { required: ['invert'] },
        { required: ['orientation'] },
      ],
      additionalProperties: false,
    },
    execute: observeTool(
      'set_display',
      () => [],
      async (input, signal, setUndo) => {
        const state = viewportGrid?.getState();
        const viewportId =
          typeof input.viewport === 'string' && input.viewport
            ? input.viewport
            : (state?.activeViewportId ?? '');
        if (!viewportId) {
          return refuse(
            'NO_VIEWPORT',
            'There is no viewport to change.',
            'Open a study first, then call get_context.'
          );
        }
        if (!state?.viewports.has(viewportId)) {
          return refuse(
            'NO_SUCH_VIEWPORT',
            `There is no viewport with id ${viewportId}.`,
            'Call get_context and use one of the pane viewport ids it returns.'
          );
        }
        if (!(await viewportReady(cornerstone, viewportId))) {
          return refuse(
            'VIEWPORT_NOT_READY',
            'That viewport is still being built, so the display was not changed.',
            'Wait a moment and call set_display again.'
          );
        }
        ensureActive(signal);
        const csViewport = cornerstone?.getCornerstoneViewport(viewportId);
        if (!csViewport) {
          return refuse(
            'VIEWPORT_NOT_READY',
            'That viewport is unavailable.',
            'Wait and try again.'
          );
        }
        const previousProperties = csViewport?.getProperties?.();
        const previousCamera = csViewport?.getCamera?.();
        const previousOrientation = cornerstone?.getOrientation?.(viewportId);
        const requestedOrientation =
          typeof input.orientation === 'string' ? input.orientation.trim().toLowerCase() : '';
        if (
          requestedOrientation &&
          !['axial', 'coronal', 'sagittal'].includes(requestedOrientation)
        ) {
          return refuse(
            'NO_SUCH_ORIENTATION',
            `There is no MPR orientation called "${input.orientation}".`,
            'Use axial, coronal, or sagittal.'
          );
        }
        const restoreDisplay = () => {
          if (previousProperties) csViewport?.setProperties?.(previousProperties);
          if (previousCamera) csViewport?.setCamera?.(previousCamera);
          if (previousOrientation) {
            deps.commandsManager.runCommand('setViewportOrientation', {
              viewportId,
              orientation: previousOrientation,
            });
          }
          csViewport?.render?.();
        };
        const applied: string[] = [];
        if (typeof input.preset === 'string' && input.preset) {
          const key = input.preset.trim().toLowerCase();
          const preset = CT_PRESETS.get(key);
          if (!preset) {
            return refuse(
              'NO_SUCH_PRESET',
              `There is no window preset called "${input.preset}".`,
              `Use one of: ${[...CT_PRESETS.keys()].join(', ')}.`
            );
          }
          const beforeVoi = previousProperties as { voiRange?: VoiRange } | undefined;
          if (!matchesWindowLevel(beforeVoi?.voiRange, preset.window, preset.level)) {
            deps.commandsManager.runCommand('setViewportWindowLevel', {
              viewportId,
              windowWidth: preset.window,
              windowCenter: preset.level,
            });
          }
          const appliedProperties = csViewport.getProperties?.() as
            | { voiRange?: VoiRange }
            | undefined;
          if (!matchesWindowLevel(appliedProperties?.voiRange, preset.window, preset.level)) {
            restoreDisplay();
            return refuse(
              'DISPLAY_NOT_APPLIED',
              'The viewport did not apply the requested window preset.',
              'The requested display state was rolled back; wait for the viewport and try again.'
            );
          }
          if (!matchesWindowLevel(beforeVoi?.voiRange, preset.window, preset.level)) {
            applied.push(`${key} window`);
          }
        }
        if (input.reset_zoom_pan === true) {
          viewportGrid?.setActiveViewportId(viewportId);
          deps.commandsManager.runCommand('resetViewport');
          const resetCamera = csViewport.getCamera?.();
          if (JSON.stringify(resetCamera) !== JSON.stringify(previousCamera))
            applied.push('reset view');
        }
        if (typeof input.invert === 'boolean') {
          if ((previousProperties as { invert?: boolean } | undefined)?.invert !== input.invert) {
            csViewport?.setProperties?.({ invert: input.invert });
            csViewport?.render?.();
            if (
              (csViewport.getProperties?.() as { invert?: boolean } | undefined)?.invert !==
              input.invert
            ) {
              restoreDisplay();
              return refuse(
                'DISPLAY_NOT_APPLIED',
                'The viewport did not apply inversion.',
                'The prior display was restored.'
              );
            }
            applied.push(input.invert ? 'inverted' : 'not inverted');
          }
        }
        if (requestedOrientation) {
          if (previousOrientation?.toLowerCase() !== requestedOrientation) {
            deps.commandsManager.runCommand('setViewportOrientation', {
              viewportId,
              orientation: requestedOrientation.toUpperCase(),
            });
            if (cornerstone?.getOrientation?.(viewportId)?.toLowerCase() !== requestedOrientation) {
              restoreDisplay();
              return refuse(
                'DISPLAY_NOT_APPLIED',
                'The viewport did not apply the requested orientation.',
                'The prior display was restored; use a reconstructable series and try again.'
              );
            }
            applied.push(`${requestedOrientation} orientation`);
          }
        }
        if (applied.length === 0) {
          return refuse(
            'NOTHING_TO_DO',
            'Give a preset or ask to reset zoom and pan.',
            'Presets are named the way a radiologist names them: lung, soft tissue, bone, brain.'
          );
        }
        setUndo?.(restoreDisplay);
        return { viewport: viewportId, applied };
      }
    ),
  };

  const hangLayout: WebMcpTool = {
    name: 'hang_layout',
    title: 'Hang the study',
    description:
      'Sets the viewport grid and puts a named series in each pane — one row by two ' +
      'columns with the current study and its prior is the usual comparison hang. ' +
      'Changes the screen immediately and is reversible by calling it again. Returns ' +
      'the layout and what landed in each pane so you can confirm it went where you ' +
      'meant. Get the series ids from get_study first; this refuses ids it does not ' +
      'recognise rather than silently leaving a pane empty.',
    inputSchema: {
      type: 'object',
      required: ['rows', 'cols'],
      properties: {
        rows: { type: 'integer', minimum: 1, maximum: 9, description: 'Number of viewport rows.' },
        cols: {
          type: 'integer',
          minimum: 1,
          maximum: 9,
          description: 'Number of viewport columns.',
        },
        viewports: {
          type: 'array',
          minItems: 1,
          maxItems: 9,
          description:
            'What to show in each pane, in reading order (left to right, top to bottom). ' +
            'Omit to keep whatever is already displayed.',
          items: {
            type: 'object',
            required: ['series_uid'],
            properties: {
              series_uid: {
                type: 'string',
                minLength: 1,
                maxLength: 64,
                description: 'A series_uid from get_study.',
              },
              orientation: {
                type: 'string',
                enum: ['axial', 'coronal', 'sagittal'],
                description: 'Optional axial, coronal, or sagittal MPR orientation.',
              },
              preset: {
                type: 'string',
                enum: [...CT_PRESETS.keys()],
                description: 'Optional window preset such as lung or soft tissue.',
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'hang_layout',
      () => [],
      async (input, signal, setUndo) => {
        const rows = Number(input.rows);
        const cols = Number(input.cols);
        if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1) {
          return refuse(
            'BAD_LAYOUT',
            'Rows and columns must both be at least one.',
            'A current-and-prior comparison is one row by two columns.'
          );
        }
        if (rows * cols > 9) {
          return refuse(
            'LAYOUT_TOO_BIG',
            'That is more viewports than anyone can read at once.',
            'Nine is the practical ceiling; two or three is usual for a comparison.'
          );
        }

        // Resolve every requested series BEFORE changing anything on screen, so a
        // typo in one id does not leave the radiologist with a half-rearranged
        // hang they have to put back by hand.
        const requested = Array.isArray(input.viewports) ? input.viewports : [];
        let sets = displaySet?.getActiveDisplaySets() ?? [];
        const studies = await inventory.get(activeStudyUid());
        ensureActive(signal);
        const resolved: {
          seriesUid: string;
          displaySetUid: string;
          orientation: string;
          preset: string;
        }[] = [];
        for (const entry of requested) {
          const seriesUid =
            entry !== null && typeof entry === 'object'
              ? String((entry as JsonObject).series_uid ?? '')
              : '';
          let match = sets.find(candidate => candidate.SeriesInstanceUID === seriesUid);
          const row =
            entry !== null && typeof entry === 'object'
              ? (entry as JsonObject)
              : ({} as JsonObject);
          const orientation =
            typeof row.orientation === 'string' ? row.orientation.trim().toLowerCase() : '';
          const preset = typeof row.preset === 'string' ? row.preset.trim().toLowerCase() : '';
          if (orientation && !['axial', 'coronal', 'sagittal'].includes(orientation)) {
            return refuse(
              'NO_SUCH_ORIENTATION',
              `There is no MPR orientation called "${row.orientation}".`,
              'Use axial, coronal, or sagittal.'
            );
          }
          if (preset && !CT_PRESETS.has(preset)) {
            return refuse(
              'NO_SUCH_PRESET',
              `There is no window preset called "${row.preset}".`,
              `Use one of: ${[...CT_PRESETS.keys()].join(', ')}.`
            );
          }
          if (!match) {
            const discovered = studies
              .flatMap(study => study.series)
              .find(candidate => candidate.seriesUid === seriesUid);
            if (discovered) {
              try {
                await Promise.resolve(
                  deps.commandsManager.runCommand('loadStudy', {
                    StudyInstanceUID: discovered.studyUid,
                  })
                );
                ensureActive(signal);
                sets = displaySet?.getActiveDisplaySets() ?? [];
                match = sets.find(candidate => candidate.SeriesInstanceUID === seriesUid);
              } catch (error) {
                return refuse(
                  'STUDY_LOAD_FAILED',
                  error instanceof Error
                    ? error.message
                    : 'The selected study could not be loaded.',
                  'Keep the study open and call hang_layout again.'
                );
              }
            }
          }
          if (!match) {
            return refuse(
              'NO_SUCH_SERIES',
              `No discoverable series has the id ${seriesUid || '(missing)'}.`,
              'Call get_study to list the available series and use the ' +
                'series_uid values it returns.'
            );
          }
          resolved.push({
            seriesUid,
            displaySetUid: match.displaySetInstanceUID,
            orientation,
            preset,
          });
        }
        if (resolved.length > rows * cols) {
          return refuse(
            'TOO_MANY_SERIES',
            `You asked for ${resolved.length} series in ${rows * cols} panes.`,
            'Either enlarge the grid or send fewer series.'
          );
        }

        const before = viewportGrid?.getState();
        const priorLayout = before
          ? { rows: before.layout.numRows, cols: before.layout.numCols }
          : null;
        const priorPanes = before
          ? [...before.viewports.values()].map(viewport => [
              ...(viewport.displaySetInstanceUIDs ?? []),
            ])
          : [];
        const restoreLayout = async () => {
          if (!priorLayout) return;
          deps.commandsManager.runCommand('setViewportGridLayout', {
            numRows: priorLayout.rows,
            numCols: priorLayout.cols,
          });
          const wanted = priorLayout.rows * priorLayout.cols;
          let ids: string[] = [];
          for (let attempt = 0; attempt < 60; attempt += 1) {
            const restored = viewportGrid?.getState();
            ids = restored ? [...restored.viewports.keys()] : [];
            if (ids.length >= wanted) break;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          const updates = priorPanes
            .map((displaySetInstanceUIDs, index) => ({
              viewportId: ids[index],
              displaySetInstanceUIDs,
            }))
            .filter(entry => Boolean(entry.viewportId) && entry.displaySetInstanceUIDs.length > 0);
          if (updates.length > 0) await viewportGrid?.setDisplaySetsForViewports(updates);
        };

        for (const viewportId of before ? [...before.viewports.keys()] : []) {
          if (!(await viewportReady(cornerstone, viewportId))) {
            return refuse(
              'VIEWPORT_NOT_READY',
              'The current viewport is still loading, so the layout was not changed.',
              'Wait a moment and call hang_layout again.'
            );
          }
          ensureActive(signal);
        }

        const readyEvent = viewportGrid?.EVENTS?.VIEWPORTS_READY;
        const nextGridReady = new Promise<void>(resolve => {
          if (!viewportGrid?.subscribe || !readyEvent) {
            resolve();
            return;
          }
          let finished = false;
          let subscription: { unsubscribe: () => void } | undefined;
          const finish = () => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            subscription?.unsubscribe();
            signal?.removeEventListener('abort', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 3000);
          signal?.addEventListener('abort', finish, { once: true });
          subscription = viewportGrid.subscribe(readyEvent, finish);
        });

        ensureActive(signal);
        setUndo?.(restoreLayout);
        deps.commandsManager.runCommand('setViewportGridLayout', {
          numRows: rows,
          numCols: cols,
        });
        await nextGridReady;
        ensureActive(signal);

        // The grid rebuilds its viewport ids asynchronously. A single microtask
        // is not enough — waiting only that long assigns the series to viewports
        // that are about to be torn down, and the new panes then come up holding
        // whatever the hanging protocol chose. Wait for the grid to actually be
        // the size that was asked for.
        if (resolved.length > 0) {
          const wanted = rows * cols;
          let viewportIds: string[] = [];
          for (let attempt = 0; attempt < 60; attempt += 1) {
            const state = viewportGrid?.getState();
            viewportIds = state ? [...state.viewports.keys()] : [];
            if (viewportIds.length >= wanted) break;
            await new Promise(resolve => setTimeout(resolve, 50));
            ensureActive(signal);
          }
          const updates = resolved
            .map((entry, index) => ({
              viewportId: viewportIds[index],
              displaySetInstanceUIDs: [entry.displaySetUid],
              // Use OHIF's native one-shot stack positioning rather than a
              // follow-up navigation. The hang is readable even if the next
              // agent call is blocked, and no pixels cross the tool boundary.
              viewportOptions:
                token['hang/initial-stack-position'] === 'midpoint'
                  ? { initialImageOptions: { preset: 'middle' as const, useOnce: true } }
                  : undefined,
            }))
            .filter(entry => Boolean(entry.viewportId));
          if (updates.length < resolved.length) {
            await restoreLayout();
            return refuse(
              'GRID_NOT_READY',
              'The viewport grid did not finish rebuilding, so the series were not placed.',
              'Call hang_layout again; the layout itself was applied.'
            );
          }
          await viewportGrid?.setDisplaySetsForViewports(updates);
          ensureActive(signal);
        }

        const finalState = viewportGrid?.getState();
        const finalIds = finalState ? [...finalState.viewports.keys()] : [];
        for (const [index, entry] of resolved.entries()) {
          const viewportId = finalIds[index];
          if (!viewportId || (!entry.orientation && !entry.preset)) continue;
          await viewportReady(cornerstone, viewportId);
          ensureActive(signal);
          if (entry.orientation) {
            deps.commandsManager.runCommand('setViewportOrientation', {
              viewportId,
              orientation: entry.orientation.toUpperCase(),
            });
            if (cornerstone?.getOrientation?.(viewportId)?.toLowerCase() !== entry.orientation) {
              await restoreLayout();
              return refuse(
                'DISPLAY_NOT_APPLIED',
                `Pane ${index + 1} did not apply the requested orientation.`,
                'The prior layout was restored.'
              );
            }
          }
          if (entry.preset) {
            const values = CT_PRESETS.get(entry.preset)!;
            deps.commandsManager.runCommand('setViewportWindowLevel', {
              viewportId,
              windowWidth: values.window,
              windowCenter: values.level,
            });
            const properties = cornerstone
              ?.getCornerstoneViewport(viewportId)
              ?.getProperties?.() as { voiRange?: VoiRange } | undefined;
            if (!matchesWindowLevel(properties?.voiRange, values.window, values.level)) {
              await restoreLayout();
              return refuse(
                'DISPLAY_NOT_APPLIED',
                `Pane ${index + 1} did not apply the requested window preset.`,
                'The prior layout was restored.'
              );
            }
          }
        }
        const placed = resolved.every(
          (entry, index) =>
            finalState?.viewports.get(finalIds[index])?.displaySetInstanceUIDs?.[0] ===
            entry.displaySetUid
        );
        if (!placed) {
          await restoreLayout();
          return refuse(
            'SERIES_NOT_PLACED',
            'The rebuilt grid did not retain every requested series.',
            'The prior layout was restored; wait for the viewer and try again.'
          );
        }
        return {
          rows,
          cols,
          panes: resolved.map((entry, index) => ({
            pane: index + 1,
            viewport: finalIds[index] ?? '',
            series_uid: entry.seriesUid,
            orientation: entry.orientation,
            preset: entry.preset,
          })),
        };
      }
    ),
  };

  const proposeMeasurement: WebMcpTool = {
    name: 'propose_measurement',
    title: 'Copy a measurement onto another timepoint',
    description:
      'Takes a measurement the radiologist already made and draws a COPY of it on ' +
      'another study at the matching anatomical position, so the same lesion can be ' +
      'measured again at the next timepoint. Use this when the radiologist says plain ' +
      'things like "call this target one and find the same spot on last year\'s scan." ' +
      "When a label is supplied, it also names the radiologist's source measurement so " +
      'the two timepoints can be paired later. The copy appears dashed and is a proposal, ' +
      'not a measurement: it is not citable in a report until the radiologist accepts ' +
      'it, and they will usually adjust it first. ' +
      'It is placed by geometry alone. Nothing here looks at the image, and it does not ' +
      'decide whether the lesion is still there or how big it is now — only a person can ' +
      'do that. It refuses without a source measurement, because there is no way for you ' +
      'to propose a measurement of your own.',
    inputSchema: {
      type: 'object',
      required: ['from_measurement_id', 'target_series_uid'],
      properties: {
        from_measurement_id: {
          type: 'string',
          minLength: 1,
          description: 'A measurement_id from list_measurements. This is what gets copied.',
        },
        target_series_uid: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description: 'The exact destination series_uid from get_study.',
        },
        target_study_uid: {
          type: 'string',
          description: 'The study to copy it onto, from get_study. Usually the prior.',
        },
        target_timepoint: {
          type: 'string',
          description: 'Study uid or study date for the destination timepoint.',
        },
        label: {
          type: 'string',
          description:
            'What to call both the source and its proposed copy, for example "target 1". ' +
            'Copied from the source if omitted.',
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'propose_measurement',
      input => (typeof input.from_measurement_id === 'string' ? [input.from_measurement_id] : []),
      async (input, signal, setUndo) => {
        ensureActive(signal);
        const sourceId = String(input.from_measurement_id ?? '');
        const source = measurement?.getMeasurement(sourceId);
        if (!source) {
          return refuse(
            'NEEDS_SOURCE',
            'There is no measurement with that id to copy.',
            'Call list_measurements first. You can only propose a copy of a measurement ' +
              'the radiologist already made; you cannot place one of your own.'
          );
        }
        if (!source.points || source.points.length === 0) {
          return refuse(
            'NO_GEOMETRY',
            'That measurement has no geometry to copy.',
            'Pick a measurement drawn on an image, such as a length or a bidirectional.'
          );
        }

        let targetStudy = String(input.target_study_uid ?? '');
        if (!targetStudy && typeof input.target_timepoint === 'string') {
          const wanted = input.target_timepoint;
          const studies = await inventory.get(activeStudyUid());
          ensureActive(signal);
          targetStudy =
            studies.find(study => study.studyUid === wanted || study.studyDate === wanted)
              ?.studyUid ?? '';
        }
        const targetSeriesUid = String(input.target_series_uid ?? '');
        const target = (displaySet?.getActiveDisplaySets() ?? []).find(
          entry => entry.SeriesInstanceUID === targetSeriesUid
        );
        if (!target) {
          return refuse(
            'TARGET_SERIES_NOT_LOADED',
            `The requested destination series ${targetSeriesUid} is not loaded.`,
            'Call get_study and hang_layout, then pass the exact loaded target_series_uid.'
          );
        }
        if (targetStudy && target.StudyInstanceUID !== targetStudy) {
          return refuse(
            'TARGET_SERIES_STUDY_MISMATCH',
            'The requested series does not belong to the requested destination study.',
            'Use the study_uid and series_uid from the same get_study result.'
          );
        }
        targetStudy = target.StudyInstanceUID;
        if (targetStudy === source.referenceStudyUID) {
          return refuse(
            'SAME_STUDY',
            'That is the study the measurement is already on.',
            'Pass the other timepoint, from get_study.'
          );
        }

        const instances: TargetInstance[] = (target.instances ?? [])
          .map((instance, index) => ({
            imageId: target.imageIds?.[index] ?? instance.imageId ?? '',
            position: (instance.ImagePositionPatient ?? []) as [number, number, number],
            frameOfReferenceUID: instance.FrameOfReferenceUID ?? '',
          }))
          .filter(entry => entry.imageId !== '' && entry.position.length === 3);
        if (instances.length === 0) {
          return refuse(
            'NO_POSITIONS',
            'The target series does not carry image positions, so the copy cannot be placed.',
            'Without ImagePositionPatient there is no way to know which slice matches, and ' +
              'guessing would put the mark in the wrong place.'
          );
        }
        const sourceFrame = source.FrameOfReferenceUID ?? '';
        const targetFrames = new Set(instances.map(instance => instance.frameOfReferenceUID));
        if (!sourceFrame || targetFrames.has('')) {
          return refuse(
            'MISSING_FRAME_OF_REFERENCE',
            'The source or destination is missing FrameOfReferenceUID, so geometry cannot be copied safely.',
            'Have the radiologist measure this timepoint directly.'
          );
        }
        if (targetFrames.size !== 1 || !targetFrames.has(sourceFrame)) {
          return refuse(
            'FRAME_OF_REFERENCE_MISMATCH',
            'The source and destination do not share a frame of reference and no registration transform is available.',
            'Have the radiologist measure this timepoint directly; raw patient coordinates cannot be copied between frames.'
          );
        }

        const normal = source.metadata?.viewPlaneNormal ?? [0, 0, -1];
        const placement = findTargetSlice(
          source.points[0],
          source.FrameOfReferenceUID ?? '',
          normal,
          instances
        );
        if (!placement) {
          return refuse(
            'NO_MATCHING_SLICE',
            'No slice in the target study matches that position.',
            'The two studies may not overlap anatomically.'
          );
        }
        ensureActive(signal);

        const requestedLabel = typeof input.label === 'string' ? input.label.trim() : '';
        const label = requestedLabel || source.label || 'proposed';
        const annotationUID = placeProposal(
          {
            uid: source.uid,
            toolName: source.toolName ?? 'Length',
            points: source.points,
            label: source.label,
            FrameOfReferenceUID: source.FrameOfReferenceUID ?? '',
            metadata: {
              viewPlaneNormal: source.metadata?.viewPlaneNormal,
              viewUp: source.metadata?.viewUp,
            },
          },
          placement,
          {
            seriesUID: target.SeriesInstanceUID,
            studyUID: target.StudyInstanceUID,
            frameOfReferenceUID: instances[0].frameOfReferenceUID,
          },
          label
        );

        // Naming the human-made source is bookkeeping, not image interpretation. It is
        // essential for compare_with_prior, which deliberately pairs timepoints by the
        // radiologist's label rather than guessing correspondence from pixels.
        try {
          if (requestedLabel && requestedLabel !== source.label) {
            measurement?.update(source.uid, { ...source, label: requestedLabel }, true);
          }
        } catch (error) {
          rejectProposal(annotationUID);
          throw error;
        }
        setUndo?.(() => {
          rejectProposal(annotationUID);
          if (requestedLabel && requestedLabel !== source.label) {
            measurement?.update(source.uid, { ...source }, true);
          }
        });

        return {
          proposal_id: annotationUID,
          copied_from: source.uid,
          source_label: label,
          label,
          target_study_uid: target.StudyInstanceUID,
          target_series_uid: target.SeriesInstanceUID,
          offset_mm: placement.offsetMm,
          aligned: true,
          state: 'proposed',
          note: 'Placed at the matching position in the same frame of reference. The radiologist accepts or adjusts it.',
        };
      }
    ),
  };

  const compareWithPrior: WebMcpTool = {
    name: 'compare_with_prior',
    title: 'Change between timepoints',
    description:
      'Pairs up measurements that share a label across studies and reports the change ' +
      'between them. Read-only. It uses only measurements the radiologist made or ' +
      'accepted — a proposal nobody has accepted is left out and reported as unmatched, ' +
      'because an unconfirmed mark is not evidence of anything.',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        labels: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          description: 'Only compare these labels. Omit to compare everything labelled.',
          items: { type: 'string', minLength: 1 },
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'compare_with_prior',
      () => [],
      async input => {
        const wanted = Array.isArray(input.labels)
          ? new Set(input.labels.map(entry => String(entry)))
          : null;
        const all = measurement?.getMeasurements() ?? [];
        const sets = displaySet?.getActiveDisplaySets() ?? [];
        const dateOf = (studyUid: string) => {
          const match = sets.find(entry => entry.StudyInstanceUID === studyUid);
          return match ? acquiredOn(match) : '';
        };

        const citable = all.filter(entry => isCitable(entry.uid));
        const skipped = all.filter(entry => !isCitable(entry.uid));

        const byLabel = new Map<string, { date: string; value: string; id: string }[]>();
        for (const entry of citable) {
          const label = (entry.label ?? '').trim();
          if (!label) continue;
          if (wanted && !wanted.has(label)) continue;
          const rows = byLabel.get(label) ?? [];
          rows.push({
            date: dateOf(entry.referenceStudyUID ?? ''),
            value: describeMeasurement(entry, trackedSeries()).value as string,
            id: entry.uid,
          });
          byLabel.set(label, rows);
        }

        const compared = [...byLabel.entries()].map(([label, rows]) => {
          const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
          const numbers = ordered.map(row => Number.parseFloat(row.value));
          const first = numbers[0];
          const last = numbers[numbers.length - 1];
          const measurable = ordered.length > 1 && Number.isFinite(first) && Number.isFinite(last);
          // A copy that has never been displayed has no computed size yet:
          // Cornerstone works its stats out when it draws. Saying "only one
          // timepoint measured" would be wrong and would hide a real next step.
          const awaitingDisplay =
            ordered.length > 1 &&
            ordered.some(row => !Number.isFinite(Number.parseFloat(row.value)));
          return {
            label,
            timepoints: ordered.map(row => ({
              date: row.date,
              value: row.value,
              measurement_id: row.id,
            })),
            change_mm: measurable ? Math.round((last - first) * 10) / 10 : null,
            // Said in words as well, because "+2.1" needs a direction to mean
            // anything to a reader.
            change: measurable
              ? last > first
                ? `larger by ${Math.round((last - first) * 10) / 10} mm`
                : last < first
                  ? `smaller by ${Math.round((first - last) * 10) / 10} mm`
                  : 'unchanged'
              : awaitingDisplay
                ? 'the copy has not been opened and re-measured yet, so there is no size to compare'
                : 'only one timepoint measured',
          };
        });

        return {
          compared,
          unmatched: compared.filter(row => row.timepoints.length < 2).map(row => row.label),
          not_yet_accepted: skipped.length,
          note:
            skipped.length > 0
              ? `${skipped.length} proposal(s) are not included because nobody has accepted them yet.`
              : '',
        };
      }
    ),
  };

  const draftReport: WebMcpTool = {
    name: 'draft_report',
    title: 'Assemble the findings from the measurements',
    description:
      'Writes a report draft from measurements that already exist. Every sentence may ' +
      'cite measurement ids, and a sentence that cites none is flagged as unsupported — ' +
      'it is not refused, because a radiologist writes true things that are not ' +
      'measurements, but the signer is shown it separately and has to accept it ' +
      'deliberately. It refuses to cite a proposal nobody has accepted. ' +
      'You are assembling, not interpreting: every number in a sentence must come from ' +
      'list_measurements or compare_with_prior, and you may not describe anything you ' +
      'think you can see in the image. ' +
      'When the radiologist has replied to a sentence, answer them by sending that ' +
      'sentence again with replaces_sentence_id and answers_reply_id set, rather than ' +
      'submitting a fresh draft over the top of their question.',
    inputSchema: {
      type: 'object',
      required: ['template'],
      properties: {
        template: {
          type: 'string',
          minLength: 1,
          maxLength: 256,
          description: 'The report shape, for example "chest CT, longitudinal".',
        },
        note_to_signer: {
          type: 'string',
          description: 'Anything the radiologist should know before reading it.',
        },
        sentences: {
          type: 'array',
          minItems: 1,
          description: 'The report, in order.',
          items: {
            type: 'object',
            required: ['section', 'text'],
            properties: {
              section: {
                type: 'string',
                minLength: 1,
                description: 'Which part of the report, for example Findings or Impression.',
              },
              text: { type: 'string', minLength: 1, maxLength: 4000, description: 'One sentence.' },
              cites: {
                type: 'array',
                minItems: 1,
                description: 'measurement_ids this sentence rests on.',
                items: { type: 'string', minLength: 1 },
              },
              replaces_sentence_id: {
                type: 'string',
                description: 'The sentence this revises, when answering a reply.',
              },
              answers_reply_id: {
                type: 'string',
                description: 'The reply this answers.',
              },
            },
            additionalProperties: false,
          },
        },
        sections: {
          type: 'array',
          minItems: 1,
          description: 'Structured report sections; use this or the flat sentences form.',
          items: {
            type: 'object',
            required: ['name', 'sentences'],
            properties: {
              name: {
                type: 'string',
                minLength: 1,
                description: 'Section name, such as Findings.',
              },
              sentences: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string', minLength: 1, maxLength: 4000 },
                    provenance: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['measurement_id'],
                        properties: { measurement_id: { type: 'string' } },
                        additionalProperties: false,
                      },
                    },
                    replaces_sentence_id: { type: 'string' },
                    answers_reply_id: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
      },
      oneOf: [{ required: ['sentences'] }, { required: ['sections'] }],
      additionalProperties: false,
    },
    execute: observeTool(
      'draft_report',
      () => [],
      async (input, signal, setUndo) => {
        ensureActive(signal);
        const flatRows = Array.isArray(input.sentences) ? input.sentences : [];
        const nestedRows = Array.isArray(input.sections)
          ? input.sections.flatMap(section => {
              if (section === null || typeof section !== 'object' || Array.isArray(section))
                return [];
              const sectionRow = section as JsonObject;
              if (!Array.isArray(sectionRow.sentences)) return [];
              return sectionRow.sentences.map(sentence => {
                if (sentence === null || typeof sentence !== 'object' || Array.isArray(sentence)) {
                  return sentence;
                }
                const row = sentence as JsonObject;
                const provenance = Array.isArray(row.provenance) ? row.provenance : [];
                return {
                  ...row,
                  section: String(sectionRow.name ?? 'Findings'),
                  cites: provenance.map(entry =>
                    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
                      ? String((entry as JsonObject).measurement_id ?? '')
                      : ''
                  ),
                };
              });
            })
          : [];
        const rows = flatRows.length > 0 ? flatRows : nestedRows;
        if (rows.length === 0) {
          return refuse(
            'EMPTY_REPORT',
            'A report needs at least one sentence.',
            'Call compare_with_prior first and write one sentence per finding.'
          );
        }

        const liveMeasurements = measurement?.getMeasurements() ?? [];
        const known = new Set(liveMeasurements.map(entry => entry.uid));
        const previous = currentVersion();
        const revising =
          previous !== null &&
          rows.some(
            row =>
              row !== null &&
              typeof row === 'object' &&
              typeof (row as JsonObject).replaces_sentence_id === 'string'
          );
        const sentences: Sentence[] = revising ? [...previous.sentences] : [];

        for (const [index, row] of rows.entries()) {
          const entry = row as JsonObject;
          const text = String(entry.text ?? '').trim();
          if (!text) {
            return refuse(
              'EMPTY_SENTENCE',
              `Sentence ${index + 1} has no text.`,
              'Every sentence needs something in it.'
            );
          }
          const cites = Array.isArray(entry.cites) ? entry.cites.map(c => String(c)) : [];
          for (const id of cites) {
            if (!known.has(id)) {
              return refuse(
                'NO_SUCH_MEASUREMENT',
                `Sentence ${index + 1} cites a measurement that does not exist: ${id}.`,
                'Call list_measurements for the current ids.'
              );
            }
            if (!isCitable(id)) {
              return refuse(
                'NOT_ACCEPTED',
                `Sentence ${index + 1} cites a copy the radiologist has not accepted yet.`,
                'A proposal is not evidence until a person accepts it. Ask them to review it, ' +
                  'or cite the measurement it was copied from instead.'
              );
            }
          }
          const replacesSentenceId =
            typeof entry.replaces_sentence_id === 'string' ? entry.replaces_sentence_id : undefined;
          const replacedIndex = replacesSentenceId
            ? sentences.findIndex(sentence => sentence.sentenceId === replacesSentenceId)
            : -1;
          if (replacesSentenceId && replacedIndex < 0) {
            return refuse(
              'NO_SUCH_SENTENCE',
              `There is no report sentence with id ${replacesSentenceId}.`,
              'Read get_context for the open replies and use the sentence_id it returns.'
            );
          }
          const replaced = replacedIndex >= 0 ? sentences[replacedIndex] : undefined;
          const answersReplyId =
            typeof entry.answers_reply_id === 'string' ? entry.answers_reply_id : undefined;
          if (
            answersReplyId &&
            !replaced?.replies.some(reply => reply.replyId === answersReplyId)
          ) {
            return refuse(
              'NO_SUCH_REPLY',
              `That sentence has no open reply with id ${answersReplyId}.`,
              'Read get_context again and answer the reply_id it returns.'
            );
          }

          const sentenceId = `s${Date.now()}-${index + 1}`;
          const sentence: Sentence = {
            sentenceId,
            section: String(entry.section ?? 'Findings'),
            text,
            author: {
              type: 'agent',
              label: 'your agent',
              owner: 'active-reader',
              delegate: 'substrate',
            },
            provenance: cites.map(id => ({ measurementId: id })),
            replacesSentenceId,
            replies: (replaced?.replies ?? []).map(reply =>
              reply.replyId === answersReplyId ? { ...reply, answeredByPointId: sentenceId } : reply
            ),
            review: 'unreviewed',
          };
          if (replacedIndex >= 0) sentences[replacedIndex] = sentence;
          else sentences.push(sentence);
        }

        const flagged = sentences
          .filter(sentence => sentence.provenance.length === 0)
          .map(sentence => sentence.sentenceId);
        const cited = new Set(
          sentences.flatMap(sentence => sentence.provenance.map(item => item.measurementId))
        );
        const activeSets = displaySet?.getActiveDisplaySets() ?? [];
        const snapshots: MeasurementSnapshot[] = liveMeasurements
          .filter(entry => cited.has(entry.uid))
          .map(entry => {
            const set = activeSets.find(row => row.SeriesInstanceUID === entry.referenceSeriesUID);
            const referencedImageId = entry.metadata?.referencedImageId ?? '';
            const instanceIndex = referencedImageId
              ? (set?.imageIds?.indexOf(referencedImageId) ?? -1)
              : -1;
            // Do not substitute the first image when the measurement lacks an
            // exact image reference; that would bind the report to the wrong SOP.
            const instance = instanceIndex >= 0 ? set?.instances?.[instanceIndex] : undefined;
            return {
              measurementId: entry.uid,
              label: entry.label || entry.uid,
              value: String(describeMeasurement(entry, trackedSeries(), activeSets).value ?? ''),
              studyInstanceUid: entry.referenceStudyUID ?? set?.StudyInstanceUID ?? '',
              seriesInstanceUid: entry.referenceSeriesUID ?? set?.SeriesInstanceUID ?? '',
              sopInstanceUid: instance?.SOPInstanceUID ?? '',
              sopClassUid: instance?.SOPClassUID ?? '',
              frameOfReferenceUid: entry.FrameOfReferenceUID ?? instance?.FrameOfReferenceUID ?? '',
              referencedImageId,
            };
          });
        const contextUid = activeStudyUid();
        const evidenceSet =
          activeSets.find(set => set.StudyInstanceUID === contextUid) ?? activeSets[0];
        const evidenceInstance = evidenceSet?.instances?.[0];
        const evidence: ReportEvidenceSnapshot | null = evidenceSet
          ? {
              StudyInstanceUID: evidenceSet.StudyInstanceUID,
              SeriesInstanceUID: evidenceSet.SeriesInstanceUID,
              SOPInstanceUID: evidenceInstance?.SOPInstanceUID ?? '',
              SOPClassUID: evidenceInstance?.SOPClassUID ?? '',
              PatientID: evidenceInstance?.PatientID,
              PatientName: evidenceInstance?.PatientName,
              PatientBirthDate: evidenceInstance?.PatientBirthDate,
              PatientSex: evidenceInstance?.PatientSex,
              StudyDate: evidenceInstance?.StudyDate ?? evidenceSet.StudyDate,
              StudyTime: evidenceInstance?.StudyTime,
              StudyID: evidenceInstance?.StudyID,
              AccessionNumber: evidenceInstance?.AccessionNumber,
              StudyDescription: evidenceInstance?.StudyDescription,
            }
          : null;

        const version = await addVersion(
          String(input.template ?? 'report'),
          sentences,
          {
            type: 'agent',
            label: 'your agent',
            owner: 'active-reader',
            delegate: 'substrate',
          },
          typeof input.note_to_signer === 'string' ? input.note_to_signer : undefined,
          { measurements: snapshots, evidence, signal }
        );
        setUndo?.(() => {
          if (previous) void restoreVersion(previous.version);
          else clearReport();
        });

        return {
          version: version.version,
          hash: version.hash,
          sentences: sentences.length,
          unsupported: flagged.length,
          flags: flagged,
          note:
            flagged.length > 0
              ? `${flagged.length} sentence(s) cite no measurement. The radiologist will be shown ` +
                'them separately and has to accept each one before signing.'
              : 'Every sentence cites a measurement. The radiologist still has to accept every agent-authored sentence before signing.',
        };
      }
    ),
  };

  const requestSignatureTool: WebMcpTool = {
    name: 'request_signature',
    title: 'Ask the radiologist to sign',
    description:
      'Puts the report in front of the radiologist to sign. Returns immediately with ' +
      'pending — it does not wait, and it does not sign anything. Only the person can ' +
      'do that, in the dialog this opens. Poll get_context to see whether they signed, ' +
      'edited, or declined. This is the only consequential action in the tool set.',
    annotations: { consequentialHint: true },
    inputSchema: {
      type: 'object',
      required: ['summary_for_signer'],
      properties: {
        draft_id: {
          type: 'integer',
          minimum: 1,
          description: 'Report version to present. Omit for the current draft.',
        },
        summary_for_signer: {
          type: 'string',
          minLength: 1,
          maxLength: 1000,
          description:
            'One or two sentences telling the radiologist what they are about to put ' +
            'their name to, and anything you want them to check.',
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'request_signature',
      () => [],
      async (input, signal, setUndo) => {
        const version = currentVersion();
        if (!version) {
          return refuse('NO_REPORT', 'There is no report to sign.', 'Call draft_report first.');
        }
        if (typeof input.draft_id === 'number' && input.draft_id !== version.version) {
          return refuse(
            'STALE_DRAFT',
            `Draft ${input.draft_id} is not the current report version.`,
            `The current draft is version ${version.version}; review that version before requesting a signature.`
          );
        }
        ensureActive(signal);
        const opened = requestSignature(String(input.summary_for_signer ?? ''));
        if (opened) setUndo?.(() => dismissRequest());
        return {
          signature_request_id: opened?.requestId ?? '',
          status: 'pending',
          version: version.version,
          hash: version.hash,
          note: 'The radiologist decides. Poll get_context for the outcome.',
        };
      }
    ),
  };

  const tools = [
    getContext,
    getStudy,
    listMeasurements,
    navigate,
    setDisplay,
    hangLayout,
    proposeMeasurement,
    compareWithPrior,
    draftReport,
    requestSignatureTool,
  ];

  return tools.map(tool =>
    withInputValidation(
      autonomy.isConfirmable(tool.name)
        ? {
            ...tool,
            description:
              `${tool.description} At Assist, this call waits for the radiologist to Apply or ` +
              'Skip it in the viewer. A skip is final; do not retry unless they ask again.',
          }
        : tool
    )
  );
}
