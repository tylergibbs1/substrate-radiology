import { presence, summarize } from './presence'
import { refuse, type JsonObject, type JsonValue, type WebMcpTool } from './spec'

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

type Deps = {
  servicesManager: { services: Record<string, unknown> }
  commandsManager: { runCommand: (name: string, options?: unknown) => unknown }
  extensionManager: unknown
}

/* ------------------------------------------------------------ services --- */

type ViewportGridService = {
  getState: () => {
    activeViewportId: string
    viewports: Map<string, { displaySetInstanceUIDs?: string[] }>
    layout: { numRows: number; numCols: number }
  }
  setActiveViewportId: (id: string) => void
  setDisplaySetsForViewports: (
    updates: { viewportId: string; displaySetInstanceUIDs: string[] }[]
  ) => Promise<void>
}

type DisplaySet = {
  displaySetInstanceUID: string
  SeriesInstanceUID: string
  StudyInstanceUID: string
  SeriesDescription?: string
  Modality?: string
  SeriesDate?: string
  numImageFrames?: number
  isReconstructable?: boolean
}

type DisplaySetService = {
  getActiveDisplaySets: () => DisplaySet[]
  getDisplaySetByUID: (uid: string) => DisplaySet | undefined
}

type Measurement = {
  uid: string
  label?: string
  displayText?: unknown
  referenceSeriesUID?: string
  referenceStudyUID?: string
  toolName?: string
  data?: unknown
  metadata?: { referencedImageId?: string }
}

type MeasurementService = {
  getMeasurements: (filter?: (m: Measurement) => boolean) => Measurement[]
  getMeasurement: (uid: string) => Measurement | undefined
  jumpToMeasurement: (viewportId: string, uid: string) => void
}

type TrackedMeasurementsService = {
  getTrackedSeries: () => string[]
}

function services(deps: Deps) {
  const all = deps.servicesManager.services
  return {
    viewportGrid: all.viewportGridService as ViewportGridService | undefined,
    displaySet: all.displaySetService as DisplaySetService | undefined,
    measurement: all.measurementService as MeasurementService | undefined,
    tracked: all.trackedMeasurementsService as TrackedMeasurementsService | undefined,
  }
}

/* -------------------------------------------------------------- helpers --- */

/** A study's series, described the way a radiologist would name them. */
function describeSeries(displaySet: DisplaySet): JsonObject {
  return {
    series_uid: displaySet.SeriesInstanceUID,
    study_uid: displaySet.StudyInstanceUID,
    display_set_id: displaySet.displaySetInstanceUID,
    description: displaySet.SeriesDescription ?? '',
    modality: displaySet.Modality ?? '',
    series_date: displaySet.SeriesDate ?? '',
    image_count: displaySet.numImageFrames ?? 0,
    reconstructable: Boolean(displaySet.isReconstructable),
  }
}

/**
 * A measurement, flattened for an agent.
 *
 * `displayText` is what OHIF puts on the annotation, which is the same string
 * the radiologist is looking at — so an agent quoting it in a report is
 * quoting the viewport rather than deriving a number of its own.
 */
function describeMeasurement(
  measurement: Measurement,
  trackedSeries: string[]
): JsonObject {
  const value = measurement.displayText as { primary?: string[] } | string | undefined
  const primary =
    typeof value === 'string'
      ? value
      : Array.isArray(value?.primary)
        ? value.primary.join(' ')
        : ''
  return {
    measurement_id: measurement.uid,
    label: measurement.label ?? '',
    tool: measurement.toolName ?? '',
    series_uid: measurement.referenceSeriesUID ?? '',
    study_uid: measurement.referenceStudyUID ?? '',
    value: primary,
    tracked: trackedSeries.includes(measurement.referenceSeriesUID ?? ''),
  }
}

/**
 * Wrap a tool so every call is visible in the panel within a second, whether it
 * succeeded or not. An agent action nobody can see is the thing this product
 * exists to avoid.
 */
function observed(
  name: string,
  entitiesOf: (input: JsonObject, result: JsonValue) => string[],
  run: (input: JsonObject, signal?: AbortSignal) => Promise<JsonValue>
): (input: JsonObject, context?: { signal?: AbortSignal }) => Promise<JsonValue> {
  return async (input, context) => {
    const startedAt = Date.now()
    try {
      const result = await run(input ?? {}, context?.signal)
      const refused =
        typeof result === 'object' && result !== null && (result as JsonObject).ok === false
      presence.record({
        tool: name,
        argsSummary: summarize(input ?? {}),
        resultSummary: refused ? String((result as JsonObject).message) : 'done',
        entities: entitiesOf(input ?? {}, result),
        ok: !refused,
        startedAt,
      })
      return result
    } catch (error) {
      presence.record({
        tool: name,
        argsSummary: summarize(input ?? {}),
        resultSummary: error instanceof Error ? error.message : 'failed',
        entities: [],
        ok: false,
        startedAt,
      })
      throw error
    }
  }
}

/* ---------------------------------------------------------------- tools --- */

export function buildViewerTools(deps: Deps): WebMcpTool[] {
  const { viewportGrid, displaySet, measurement, tracked } = services(deps)

  const trackedSeries = () => tracked?.getTrackedSeries() ?? []

  const getContext: WebMcpTool = {
    name: 'get_context',
    title: 'What is open, and what to do next',
    description:
      'Start here. Returns the study that is open, which prior timepoints exist, the ' +
      'current viewport layout, how many measurements the radiologist has made, and a ' +
      'suggested next step. Read-only and safe to call at any time. Call this before ' +
      'anything else so you are not guessing at what is on screen.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: observed('get_context', () => [], async () => {
      const state = viewportGrid?.getState()
      const sets = displaySet?.getActiveDisplaySets() ?? []
      const studies = [...new Set(sets.map((entry) => entry.StudyInstanceUID))]
      const measurements = measurement?.getMeasurements() ?? []
      const suggested =
        sets.length === 0
          ? ['Open a study from the study list.']
          : measurements.length === 0
            ? [
                'Call get_study to see the series and any priors.',
                'Call hang_layout to put the current study and its prior side by side.',
              ]
            : [
                'Call list_measurements to read back what the radiologist measured.',
                'Call compare_with_prior once the same lesions are measured at both timepoints.',
              ]
      return {
        studies_open: studies.length,
        study_uid: studies[0] ?? '',
        prior_timepoints: Math.max(0, studies.length - 1),
        layout: state ? { rows: state.layout.numRows, cols: state.layout.numCols } : null,
        active_viewport: state?.activeViewportId ?? '',
        measurement_count: measurements.length,
        tracked_series: trackedSeries().length,
        suggested_next: suggested,
      }
    }),
  }

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
    execute: observed('get_study', () => [], async (input) => {
      const wanted = typeof input.study_uid === 'string' ? input.study_uid : ''
      const sets = (displaySet?.getActiveDisplaySets() ?? []).filter(
        (entry) => !wanted || entry.StudyInstanceUID === wanted
      )
      if (sets.length === 0) {
        return refuse(
          'NO_STUDY_LOADED',
          'No study is open in the viewer.',
          'Ask the radiologist to open a study from the study list, then call get_context.'
        )
      }
      const byStudy = new Map<string, JsonObject[]>()
      for (const entry of sets) {
        const list = byStudy.get(entry.StudyInstanceUID) ?? []
        list.push(describeSeries(entry))
        byStudy.set(entry.StudyInstanceUID, list)
      }
      return {
        studies: [...byStudy.entries()].map(([uid, series]) => ({
          study_uid: uid,
          series,
        })),
      }
    }),
  }

  const listMeasurements: WebMcpTool = {
    name: 'list_measurements',
    title: 'What the radiologist has measured',
    description:
      'Returns every measurement in the viewer with its id, label, series, tool and the ' +
      'value as it appears on screen. Read-only. This is the only source of numbers for ' +
      'a report: you may quote these, and you may not derive measurements of your own. ' +
      'Use tracked_only to get just the ones on a series the radiologist is tracking.',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        tracked_only: {
          type: 'boolean',
          description: 'Only measurements on a series the radiologist has marked as tracked.',
        },
      },
      additionalProperties: false,
    },
    execute: observed('list_measurements', () => [], async (input) => {
      const series = trackedSeries()
      const all = measurement?.getMeasurements() ?? []
      const rows = all
        .map((entry) => describeMeasurement(entry, series))
        .filter((row) => (input.tracked_only === true ? row.tracked === true : true))
      return { measurements: rows, count: rows.length }
    }),
  }

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
      },
      additionalProperties: false,
    },
    execute: observed(
      'navigate',
      (input) => (typeof input.measurement_id === 'string' ? [input.measurement_id] : []),
      async (input) => {
        const state = viewportGrid?.getState()
        const viewportId =
          typeof input.viewport === 'string' && input.viewport
            ? input.viewport
            : (state?.activeViewportId ?? '')
        if (!viewportId) {
          return refuse(
            'NO_VIEWPORT',
            'There is no viewport to move.',
            'Open a study first, then call get_context to read the active viewport id.'
          )
        }
        if (typeof input.measurement_id === 'string' && input.measurement_id) {
          const found = measurement?.getMeasurement(input.measurement_id)
          if (!found) {
            return refuse(
              'NO_SUCH_MEASUREMENT',
              'There is no measurement with that id.',
              'Call list_measurements to get current ids; they change when a measurement is deleted.'
            )
          }
          measurement?.jumpToMeasurement(viewportId, input.measurement_id)
          return { viewport: viewportId, jumped_to: input.measurement_id }
        }
        if (typeof input.slice_index === 'number') {
          // jumpToImage wants the grid viewport object and reads `.id` off it,
          // so passing the id as a string lands as undefined and throws
          // "Unsupported viewport type" from deep inside Cornerstone.
          try {
            deps.commandsManager.runCommand('jumpToImage', {
              imageIndex: input.slice_index,
              viewport: { id: viewportId },
            })
          } catch (error) {
            return refuse(
              'SLICE_OUT_OF_RANGE',
              error instanceof Error ? error.message : 'That slice does not exist in this series.',
              'Call get_study for the image_count of the series, and use a zero-based index below it.'
            )
          }
          return { viewport: viewportId, slice_index: input.slice_index }
        }
        return refuse(
          'NOTHING_TO_DO',
          'Give either a measurement_id or a slice_index.',
          'Use measurement_id to show the radiologist a measurement you are citing.'
        )
      }
    ),
  }

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
      },
      additionalProperties: false,
    },
    execute: observed('set_display', () => [], async (input) => {
      const state = viewportGrid?.getState()
      const viewportId =
        typeof input.viewport === 'string' && input.viewport
          ? input.viewport
          : (state?.activeViewportId ?? '')
      if (!viewportId) {
        return refuse(
          'NO_VIEWPORT',
          'There is no viewport to change.',
          'Open a study first, then call get_context.'
        )
      }
      const applied: string[] = []
      if (typeof input.preset === 'string' && input.preset) {
        deps.commandsManager.runCommand('setWindowLevelPreset', {
          presetName: input.preset,
          viewportId,
        })
        applied.push(`preset ${input.preset}`)
      }
      if (input.reset_zoom_pan === true) {
        deps.commandsManager.runCommand('resetViewport', { viewportId })
        applied.push('reset zoom and pan')
      }
      if (applied.length === 0) {
        return refuse(
          'NOTHING_TO_DO',
          'Give a preset or ask to reset zoom and pan.',
          'Presets are named the way a radiologist names them: lung, soft tissue, bone, brain.'
        )
      }
      return { viewport: viewportId, applied }
    }),
  }

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
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    execute: observed('hang_layout', () => [], async (input) => {
      const rows = Number(input.rows)
      const cols = Number(input.cols)
      if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1) {
        return refuse(
          'BAD_LAYOUT',
          'Rows and columns must both be at least one.',
          'A current-and-prior comparison is one row by two columns.'
        )
      }
      if (rows * cols > 9) {
        return refuse(
          'LAYOUT_TOO_BIG',
          'That is more viewports than anyone can read at once.',
          'Nine is the practical ceiling; two or three is usual for a comparison.'
        )
      }

      // Resolve every requested series BEFORE changing anything on screen, so a
      // typo in one id does not leave the radiologist with a half-rearranged
      // hang they have to put back by hand.
      const requested = Array.isArray(input.viewports) ? input.viewports : []
      const sets = displaySet?.getActiveDisplaySets() ?? []
      const resolved: { seriesUid: string; displaySetUid: string }[] = []
      for (const entry of requested) {
        const seriesUid =
          entry !== null && typeof entry === 'object'
            ? String((entry as JsonObject).series_uid ?? '')
            : ''
        const match = sets.find((candidate) => candidate.SeriesInstanceUID === seriesUid)
        if (!match) {
          return refuse(
            'NO_SUCH_SERIES',
            `No loaded series has the id ${seriesUid || '(missing)'}.`,
            'Call get_study to list the series that are actually loaded, and use the ' +
              'series_uid values it returns.'
          )
        }
        resolved.push({
          seriesUid,
          displaySetUid: match.displaySetInstanceUID,
        })
      }
      if (resolved.length > rows * cols) {
        return refuse(
          'TOO_MANY_SERIES',
          `You asked for ${resolved.length} series in ${rows * cols} panes.`,
          'Either enlarge the grid or send fewer series.'
        )
      }

      deps.commandsManager.runCommand('setViewportGridLayout', {
        numRows: rows,
        numCols: cols,
      })

      // The grid rebuilds its viewport ids asynchronously, so read them back
      // rather than assuming they are numbered the way they were before.
      if (resolved.length > 0) {
        await Promise.resolve()
        const state = viewportGrid?.getState()
        const viewportIds = state ? [...state.viewports.keys()] : []
        const updates = resolved
          .map((entry, index) => ({
            viewportId: viewportIds[index],
            displaySetInstanceUIDs: [entry.displaySetUid],
          }))
          .filter((entry) => Boolean(entry.viewportId))
        if (updates.length > 0) {
          await viewportGrid?.setDisplaySetsForViewports(updates)
        }
      }

      return {
        rows,
        cols,
        panes: resolved.map((entry, index) => ({
          pane: index + 1,
          series_uid: entry.seriesUid,
        })),
      }
    }),
  }

  return [getContext, getStudy, listMeasurements, navigate, setDisplay, hangLayout]
}
