import { autonomy } from './autonomy';
import type { JsonObject, JsonValue, WebMcpTool } from '../webmcp/spec';
import { timing } from './timing';

type PrepResult = {
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

  const currentPaneSeriesUid = String(
    rows(context.panes).find(
      pane => String(pane.viewport ?? '') === String(context.active_viewport ?? '')
    )?.series_uid ?? ''
  );
  const currentSeries = rows(current.series).find(
    series => String(series.series_uid ?? '') === currentPaneSeriesUid
  );
  const priorCandidates = rows(prior.series).filter(series => Number(series.image_count ?? 0) > 1);
  const priorSeries = priorCandidates.length === 1 ? priorCandidates[0] : undefined;
  if (!currentSeries || !priorSeries) {
    return {
      status: 'incomplete',
      studyUid: currentStudyUid,
      steps: [],
      message:
        'Full prep needs the active current series and one unambiguous prior series; select them in the viewer first.',
    };
  }

  timing.start('with-agent');
  const steps: string[] = [];
  const hang = await call('hang_layout', {
    rows: 1,
    cols: 2,
    viewports: [
      { series_uid: String(currentSeries.series_uid ?? ''), preset: 'lung' },
      { series_uid: String(priorSeries.series_uid ?? ''), preset: 'lung' },
    ],
  });
  if (signal.aborted) return { status: 'cancelled', studyUid: currentStudyUid, steps };
  if (failed(hang)) {
    timing.cancel();
    return { status: 'incomplete', studyUid: currentStudyUid, steps };
  }
  steps.push('Hung current and prior');
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
  let proposed = 0;
  for (const source of labeledPrior) {
    const measurementId = String(source.measurement_id ?? '');
    if (!measurementId || currentProposalSources.has(measurementId)) continue;
    const result = await call('propose_measurement', {
      from_measurement_id: measurementId,
      target_study_uid: currentStudyUid,
      target_series_uid: String(currentSeries.series_uid ?? ''),
      label: String(source.label ?? ''),
    });
    if (!failed(result)) proposed += 1;
    if (signal.aborted) return { status: 'cancelled', studyUid: currentStudyUid, steps };
  }
  steps.push(`Proposed ${proposed} labeled measurement${proposed === 1 ? '' : 's'}`);

  await call('compare_with_prior');
  if (signal.aborted) return { status: 'cancelled', studyUid: currentStudyUid, steps };
  steps.push('Compared available measurements');

  if (labeledPrior.length === 0) {
    timing.stop();
    return { status: 'done', studyUid: currentStudyUid, steps };
  }

  const sentences = labeledPrior.map(source => ({
    section: 'Findings',
    text: `${String(source.label)}: prior measurement ${String(source.value || 'recorded')}; current measurement awaits review.`,
    cites: [String(source.measurement_id)],
  }));
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
