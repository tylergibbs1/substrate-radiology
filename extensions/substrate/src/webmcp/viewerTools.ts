import { findTargetSlice, placeProposal, type TargetInstance } from '../engine/place';
import { autonomy } from '../engine/autonomy';
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
  type Sentence,
} from '../engine/report';
import { observeTool } from './observeTool';
import { createStudyInventory } from './studyInventory';
import { refuse, type JsonObject, type WebMcpTool } from './spec';
import {
  acquiredOn,
  activeDataSource,
  CT_PRESETS,
  describeMeasurement,
  resolveViewerServices,
  viewportReady,
  type ViewerDependencies,
} from './viewerContext';

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
        const sets = displaySet?.getActiveDisplaySets() ?? [];
        const studies = await inventory.get();
        const currentStudyUid = sets[0]?.StudyInstanceUID ?? studies[0]?.studyUid ?? '';
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
        const studies = (await inventory.get()).filter(
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
        viewport: { type: 'string', description: 'Viewport id. Omit for the active one.' },
        measurement_id: {
          type: 'string',
          description: 'Jump to the slice a measurement was made on, and frame it.',
        },
        slice_index: { type: 'number', description: 'Zero-based image index in the series.' },
        slice_location_mm: {
          type: 'number',
          description: 'Patient-space slice location in millimetres; nearest slice wins.',
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'navigate',
      input => (typeof input.measurement_id === 'string' ? [input.measurement_id] : []),
      async (input, _signal, setUndo) => {
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
        viewport: { type: 'string', description: 'Viewport id. Omit for the active one.' },
        preset: {
          type: 'string',
          description: 'A window/level preset name, for example lung, soft tissue, bone, brain.',
        },
        reset_zoom_pan: { type: 'boolean', description: 'Reset zoom and pan to the default.' },
        invert: { type: 'boolean', description: 'Set image inversion on or off.' },
        orientation: {
          type: 'string',
          description: 'MPR orientation: axial, coronal, or sagittal.',
        },
      },
      additionalProperties: false,
    },
    execute: observeTool(
      'set_display',
      () => [],
      async (input, _signal, setUndo) => {
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
        if (!(await viewportReady(cornerstone, viewportId))) {
          return refuse(
            'VIEWPORT_NOT_READY',
            'That viewport is still being built, so the display was not changed.',
            'Wait a moment and call set_display again.'
          );
        }
        const csViewport = cornerstone?.getCornerstoneViewport(viewportId);
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
          deps.commandsManager.runCommand('setViewportWindowLevel', {
            viewportId,
            windowWidth: preset.window,
            windowCenter: preset.level,
          });
          applied.push(`${key} window`);
        }
        if (input.reset_zoom_pan === true) {
          viewportGrid?.setActiveViewportId(viewportId);
          deps.commandsManager.runCommand('resetViewport');
          applied.push('reset view');
        }
        if (typeof input.invert === 'boolean') {
          csViewport?.setProperties?.({ invert: input.invert });
          csViewport?.render?.();
          applied.push(input.invert ? 'inverted' : 'not inverted');
        }
        if (requestedOrientation) {
          deps.commandsManager.runCommand('setViewportOrientation', {
            viewportId,
            orientation: requestedOrientation.toUpperCase(),
          });
          applied.push(`${requestedOrientation} orientation`);
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
        rows: { type: 'number', description: 'Number of viewport rows.' },
        cols: { type: 'number', description: 'Number of viewport columns.' },
        viewports: {
          type: 'array',
          description:
            'What to show in each pane, in reading order (left to right, top to bottom). ' +
            'Omit to keep whatever is already displayed.',
          items: {
            type: 'object',
            required: ['series_uid'],
            properties: {
              series_uid: {
                type: 'string',
                description: 'A series_uid from get_study.',
              },
              orientation: {
                type: 'string',
                description: 'Optional axial, coronal, or sagittal MPR orientation.',
              },
              preset: {
                type: 'string',
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
      async (input, _signal, setUndo) => {
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
        const studies = await inventory.get();
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

        for (const viewportId of before ? [...before.viewports.keys()] : []) {
          if (!(await viewportReady(cornerstone, viewportId))) {
            return refuse(
              'VIEWPORT_NOT_READY',
              'The current viewport is still loading, so the layout was not changed.',
              'Wait a moment and call hang_layout again.'
            );
          }
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
            resolve();
          };
          const timer = window.setTimeout(finish, 3000);
          subscription = viewportGrid.subscribe(readyEvent, finish);
        });

        deps.commandsManager.runCommand('setViewportGridLayout', {
          numRows: rows,
          numCols: cols,
        });
        await nextGridReady;

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
          }
          const updates = resolved
            .map((entry, index) => ({
              viewportId: viewportIds[index],
              displaySetInstanceUIDs: [entry.displaySetUid],
            }))
            .filter(entry => Boolean(entry.viewportId));
          if (updates.length < resolved.length) {
            return refuse(
              'GRID_NOT_READY',
              'The viewport grid did not finish rebuilding, so the series were not placed.',
              'Call hang_layout again; the layout itself was applied.'
            );
          }
          await viewportGrid?.setDisplaySetsForViewports(updates);
        }

        const finalState = viewportGrid?.getState();
        const finalIds = finalState ? [...finalState.viewports.keys()] : [];
        for (const [index, entry] of resolved.entries()) {
          const viewportId = finalIds[index];
          if (!viewportId || (!entry.orientation && !entry.preset)) continue;
          await viewportReady(cornerstone, viewportId);
          if (entry.orientation) {
            deps.commandsManager.runCommand('setViewportOrientation', {
              viewportId,
              orientation: entry.orientation.toUpperCase(),
            });
          }
          if (entry.preset) {
            const values = CT_PRESETS.get(entry.preset)!;
            deps.commandsManager.runCommand('setViewportWindowLevel', {
              viewportId,
              windowWidth: values.window,
              windowCenter: values.level,
            });
          }
        }
        if (priorLayout) {
          setUndo?.(async () => {
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
              .filter(
                entry => Boolean(entry.viewportId) && entry.displaySetInstanceUIDs.length > 0
              );
            if (updates.length > 0) await viewportGrid?.setDisplaySetsForViewports(updates);
          });
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
      required: ['from_measurement_id'],
      properties: {
        from_measurement_id: {
          type: 'string',
          description: 'A measurement_id from list_measurements. This is what gets copied.',
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
      async (input, _signal, setUndo) => {
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
          const studies = await inventory.get();
          targetStudy =
            studies.find(study => study.studyUid === wanted || study.studyDate === wanted)
              ?.studyUid ?? '';
        }
        if (!targetStudy) {
          return refuse(
            'NO_TARGET_STUDY',
            'There is no destination timepoint to copy onto.',
            'Pass target_study_uid or a target_timepoint from get_study.'
          );
        }
        if (targetStudy === source.referenceStudyUID) {
          return refuse(
            'SAME_STUDY',
            'That is the study the measurement is already on.',
            'Pass the other timepoint, from get_study.'
          );
        }

        // The target series: the largest reconstruction in that study, which is
        // the diagnostic one rather than a scout or a derived object.
        const candidates = (displaySet?.getActiveDisplaySets() ?? []).filter(
          entry => entry.StudyInstanceUID === targetStudy
        );
        const target = candidates
          .filter(entry => (entry.numImageFrames ?? 0) > 1)
          .sort((a, b) => (b.numImageFrames ?? 0) - (a.numImageFrames ?? 0))[0];
        if (!target) {
          return refuse(
            'NO_TARGET_SERIES',
            'That study has no multi-slice series to copy onto.',
            'Check get_study for the studies that are loaded and their image counts.'
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
        if (requestedLabel && requestedLabel !== source.label) {
          measurement?.update(source.uid, { ...source, label: requestedLabel }, true);
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
          aligned: placement.aligned,
          state: 'proposed',
          note: placement.aligned
            ? 'Placed at the matching position. The radiologist accepts or adjusts it.'
            : 'The two studies do not share a frame of reference, so this is a nearest-slice ' +
              'estimate. It is worth checking before accepting.',
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
          description: 'Only compare these labels. Omit to compare everything labelled.',
          items: { type: 'string' },
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
          description: 'The report shape, for example "chest CT, longitudinal".',
        },
        note_to_signer: {
          type: 'string',
          description: 'Anything the radiologist should know before reading it.',
        },
        sentences: {
          type: 'array',
          description: 'The report, in order.',
          items: {
            type: 'object',
            required: ['section', 'text'],
            properties: {
              section: {
                type: 'string',
                description: 'Which part of the report, for example Findings or Impression.',
              },
              text: { type: 'string', description: 'One sentence.' },
              cites: {
                type: 'array',
                description: 'measurement_ids this sentence rests on.',
                items: { type: 'string' },
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
          description: 'Structured report sections; use this or the flat sentences form.',
          items: {
            type: 'object',
            required: ['name', 'sentences'],
            properties: {
              name: { type: 'string', description: 'Section name, such as Findings.' },
              sentences: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string' },
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
      additionalProperties: false,
    },
    execute: observeTool(
      'draft_report',
      () => [],
      async (input, _signal, setUndo) => {
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

        const known = new Set((measurement?.getMeasurements() ?? []).map(entry => entry.uid));
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

        const version = await addVersion(
          String(input.template ?? 'report'),
          sentences,
          {
            type: 'agent',
            label: 'your agent',
            owner: 'active-reader',
            delegate: 'substrate',
          },
          typeof input.note_to_signer === 'string' ? input.note_to_signer : undefined
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
              : 'Every sentence cites a measurement.',
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
    inputSchema: {
      type: 'object',
      required: ['summary_for_signer'],
      properties: {
        draft_id: {
          type: 'number',
          description: 'Report version to present. Omit for the current draft.',
        },
        summary_for_signer: {
          type: 'string',
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
      async (input, _signal, setUndo) => {
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
    autonomy.isConfirmable(tool.name)
      ? {
          ...tool,
          description:
            `${tool.description} At Assist, this call waits for the radiologist to Apply or ` +
            'Skip it in the viewer. A skip is final; do not retry unless they ask again.',
        }
      : tool
  );
}
