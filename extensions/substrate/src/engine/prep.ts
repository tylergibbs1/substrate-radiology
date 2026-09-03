import { autonomy } from './autonomy';
import type { JsonObject, JsonValue, WebMcpTool } from '../webmcp/spec';
import { timing } from './timing';

export type PrepResult = {
  status: 'skipped' | 'done' | 'incomplete' | 'cancelled';
  studyUid?: string;
  steps: string[];
  message?: string;
};

function object(value: JsonValue | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function rows(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value)
    ? (value.filter(
        item => item !== null && typeof item === 'object' && !Array.isArray(item)
      ) as JsonObject[])
    : [];
}

function failed(value: JsonValue): boolean {
  return object(value).ok === false;
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * Deterministic prep for Full prep. It calls the same tool functions an agent
 * would call, but chooses only from metadata and human-made measurements.
 */
async function performFullPrep(
  tools: WebMcpTool[],
  signal: AbortSignal,
  routeSettleMs: number
): Promise<PrepResult> {
  if (autonomy.getLevel() !== 'full-prep') return { status: 'skipped', steps: [] };
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const call = async (name: string, input: JsonObject = {}): Promise<JsonValue> => {
    if (signal.aborted) return { ok: false, code: 'ABORTED' };
    const tool = byName.get(name);
    if (!tool) return { ok: false, code: 'MISSING_TOOL' };
    return tool.execute(input, { signal });
  };

  let context: JsonObject = {};
  let readySignature = '';
  let readyStreak = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    context = object(await call('get_context'));
    const panes = rows(context.panes);
    const signature = [
      String(context.study_uid ?? ''),
      String(context.active_viewport ?? ''),
      panes.map(pane => String(pane.series_uid ?? '')).join(','),
    ].join('|');
    const ready =
      String(context.study_uid ?? '') !== '' &&
      String(context.active_viewport ?? '') !== '' &&
      panes.some(pane => String(pane.series_uid ?? '') !== '');
    readyStreak = ready && signature === readySignature ? readyStreak + 1 : ready ? 1 : 0;
    readySignature = signature;
    // onModeEnter runs before OHIF's route initializer. Waiting for a stable,
    // populated pane prevents us from tearing down the viewport while its
    // first stack is still resolving.
    if (readyStreak >= 5) break;
    await pause(250, signal);
  }
  if (signal.aborted) return { status: 'cancelled', steps: [] };

  const currentStudyUid = String(context.study_uid ?? '');
  if (!currentStudyUid || readyStreak < 5) {
    return { status: 'incomplete', steps: [], message: 'No study became ready.' };
  }
  // OHIF resolves the first StackViewport image asynchronously after route
  // state already reports a populated pane. Let that promise finish before a
  // grid change destroys the viewport it captured.
  await pause(routeSettleMs, signal);
  if (signal.aborted) return { status: 'cancelled', steps: [] };
  const studyResult = object(await call('get_study'));
  const studies = rows(studyResult.studies);
  const current = studies.find(study => String(study.study_uid ?? '') === currentStudyUid);
  const prior = studies
    .filter(study => String(study.study_uid ?? '') !== currentStudyUid)
    .sort((a, b) => String(b.study_date ?? '').localeCompare(String(a.study_date ?? '')))[0];
  if (!current || !prior) {
    return {
      status: 'incomplete',
      studyUid: currentStudyUid,
      steps: [],
      message: 'A current study and prior are required for Full prep.',
    };
  }

  const diagnosticSeries = (study: JsonObject): JsonObject | undefined =>
    rows(study.series)
      .filter(series => Number(series.image_count ?? 0) > 1)
      .sort((a, b) => Number(b.image_count ?? 0) - Number(a.image_count ?? 0))[0];
  const currentSeries = diagnosticSeries(current);
  const priorSeries = diagnosticSeries(prior);
  if (!currentSeries || !priorSeries) {
    return {
      status: 'incomplete',
      studyUid: currentStudyUid,
      steps: [],
      message: 'The current study or prior has no diagnostic series.',
    };
  }

  timing.start('with-agent');
  const steps: string[] = [];
  const hang = await call('hang_layout', {
    rows: 1,
    cols: 2,
    viewports: [
      { series_uid: String(currentSeries.series_uid ?? '') },
      { series_uid: String(priorSeries.series_uid ?? '') },
    ],
  });
  if (failed(hang)) {
    timing.cancel();
    return { status: 'incomplete', studyUid: currentStudyUid, steps };
  }
  steps.push('Hung current and prior');

  const panes = rows(object(hang).panes);
  for (const pane of panes) {
    const viewport = String(pane.viewport ?? '');
    if (viewport) await call('set_display', { viewport, preset: 'lung' });
  }
  steps.push('Applied lung window');

  const listed = object(await call('list_measurements'));
  const measurements = rows(listed.measurements);
  const currentProposalSources = new Set(
    measurements.map(row => String(row.copied_from ?? '')).filter(Boolean)
  );
  const priorStudyUid = String(prior.study_uid ?? '');
  const labeledPrior = measurements.filter(
    row =>
      String(row.study_uid ?? '') === priorStudyUid &&
      String(row.label ?? '').trim() !== '' &&
      row.proposed !== true
  );
  for (const source of labeledPrior) {
    const measurementId = String(source.measurement_id ?? '');
    if (!measurementId || currentProposalSources.has(measurementId)) continue;
    await call('propose_measurement', {
      from_measurement_id: measurementId,
      target_study_uid: currentStudyUid,
      label: String(source.label ?? ''),
    });
  }
  steps.push(
    `Proposed ${labeledPrior.length} labeled measurement${labeledPrior.length === 1 ? '' : 's'}`
  );

  await call('compare_with_prior');
  steps.push('Compared available measurements');

  const sentences = labeledPrior.length
    ? labeledPrior.map(source => ({
        section: 'Findings',
        text: `${String(source.label)}: prior measurement ${String(source.value || 'recorded')}; current measurement awaits review.`,
        cites: [String(source.measurement_id)],
      }))
    : [
        {
          section: 'Findings',
          text: 'No labeled prior measurements were available for comparison.',
          cites: [],
        },
      ];
  const draft = await call('draft_report', {
    template: 'chest CT, longitudinal',
    sentences,
    note_to_signer: 'Prepared from existing measurements. Suggested copies still require review.',
  });
  if (failed(draft)) {
    timing.cancel();
    return {
      status: 'incomplete',
      studyUid: currentStudyUid,
      steps,
      message: String(object(draft).message ?? 'The draft was not created.'),
    };
  }
  steps.push('Prepared report draft');
  timing.stop();
  return { status: 'done', studyUid: currentStudyUid, steps };
}

export async function runFullPrep(
  tools: WebMcpTool[],
  signal: AbortSignal,
  routeSettleMs = 3000
): Promise<PrepResult> {
  try {
    return await performFullPrep(tools, signal, routeSettleMs);
  } catch (error) {
    timing.cancel();
    return {
      status: signal.aborted ? 'cancelled' : 'incomplete',
      steps: [],
      message: error instanceof Error ? error.message : 'Full prep did not finish.',
    };
  }
}
