import { autonomy } from '../engine/autonomy';
import { presence, summarize, type AgentActivity, type AgentViewportEffect } from './presence';
import { refuse, type JsonObject, type JsonValue } from './spec';

type UndoAction = () => void | Promise<void>;

function activityFor(
  name: string,
  input: JsonObject,
  completed: boolean,
  ok = true
): AgentActivity {
  if (!ok) return { action: 'Could not complete', parameter: summarize(input) || undefined };
  switch (name) {
    case 'navigate':
      return {
        action: completed ? 'Moved' : 'Moving',
        parameter: summarize(input) || 'through the study',
      };
    case 'set_display':
      return {
        action: completed ? 'Applied' : 'Applying',
        parameter: summarize(input) || 'display settings',
      };
    case 'hang_layout': {
      const viewports = Array.isArray(input.viewports) ? input.viewports.length : 0;
      const rows = typeof input.rows === 'number' ? input.rows : undefined;
      const cols = typeof input.cols === 'number' ? input.cols : undefined;
      return {
        action: completed ? 'Hung' : 'Hanging',
        parameter: viewports >= 2 ? 'current + prior' : 'study',
        result: rows && cols ? `${rows} by ${cols}` : undefined,
      };
    }
    case 'propose_measurement':
      return {
        action: completed ? 'Proposed' : 'Proposing',
        parameter: 'measurement on prior',
      };
    case 'draft_report':
      return { action: completed ? 'Drafted' : 'Drafting', parameter: 'report' };
    case 'request_signature':
      return { action: completed ? 'Prepared' : 'Preparing', parameter: 'signature review' };
    default:
      return {
        action: completed ? 'Updated' : 'Updating',
        parameter: summarize(input) || undefined,
      };
  }
}

function viewportEffects(
  name: string,
  input: JsonObject,
  result: JsonValue
): AgentViewportEffect[] {
  if (typeof result !== 'object' || result === null) return [];
  const row = result as JsonObject;
  if (name === 'navigate') {
    const viewportId = typeof row.viewport === 'string' ? row.viewport : '';
    if (!viewportId) return [];
    const label =
      typeof row.slice_index === 'number'
        ? `slice ${row.slice_index + 1}`
        : typeof input.measurement_id === 'string'
          ? 'measurement'
          : 'position changed';
    return [{ viewportId, label }];
  }
  if (name === 'set_display') {
    const viewportId = typeof row.viewport === 'string' ? row.viewport : '';
    const applied = Array.isArray(row.applied) ? row.applied.map(String).join(' · ') : '';
    return viewportId ? [{ viewportId, label: applied || 'display changed' }] : [];
  }
  if (name === 'hang_layout') {
    const panes = Array.isArray(row.panes) ? row.panes : [];
    const label = `${String(row.rows)} by ${String(row.cols)} layout`;
    return panes.flatMap(pane => {
      if (typeof pane !== 'object' || pane === null) return [];
      const viewportId = String((pane as JsonObject).viewport ?? '');
      return viewportId ? [{ viewportId, label }] : [];
    });
  }
  return [];
}

/** Add attribution, cancellation, authorization, and one-shot undo to a tool call. */
export function observeTool(
  name: string,
  entitiesOf: (input: JsonObject, result: JsonValue) => string[],
  run: (
    input: JsonObject,
    signal?: AbortSignal,
    setUndo?: (action: UndoAction) => void
  ) => Promise<JsonValue>
): (input: JsonObject, context?: { signal?: AbortSignal }) => Promise<JsonValue> {
  return async (input, context) => {
    const actualInput = input ?? {};
    const argsSummary = summarize(actualInput);
    const startedAt = Date.now();
    const localController = new AbortController();
    const stop = () => localController.abort();
    const upstreamAbort = () => localController.abort();
    if (context?.signal?.aborted) localController.abort();
    else context?.signal?.addEventListener('abort', upstreamAbort, { once: true });
    const callId = presence.begin(
      name,
      argsSummary,
      startedAt,
      stop,
      activityFor(name, actualInput, false)
    );
    let undo: UndoAction | undefined;
    const setUndo = (action: UndoAction) => {
      let used = false;
      undo = () => {
        if (used) return;
        used = true;
        return action();
      };
    };

    try {
      const decision = await autonomy.authorize(
        name,
        argsSummary,
        localController.signal,
        typeof actualInput.viewport === 'string' ? actualInput.viewport : undefined
      );
      if (decision === 'skip') {
        const stopped = localController.signal.aborted;
        const result = refuse(
          stopped ? 'STOPPED' : 'DECLINED',
          stopped
            ? 'The radiologist stopped this change.'
            : 'The radiologist declined this change.',
          'Do not retry it unless the radiologist asks again.'
        );
        presence.finish(callId, {
          tool: name,
          argsSummary,
          resultSummary: String(result.message),
          entities: [],
          ok: false,
          startedAt,
          activity: activityFor(name, actualInput, true, false),
          effects: [],
        });
        return result;
      }

      const result = await run(actualInput, localController.signal, setUndo);
      const refused =
        typeof result === 'object' && result !== null && (result as JsonObject).ok === false;
      presence.finish(callId, {
        tool: name,
        argsSummary,
        resultSummary: refused ? String((result as JsonObject).message) : 'done',
        entities: entitiesOf(actualInput, result),
        ok: !refused,
        startedAt,
        activity: activityFor(name, actualInput, true, !refused),
        effects: refused ? [] : viewportEffects(name, actualInput, result),
        undo: refused ? undefined : undo,
      });
      return result;
    } catch (error) {
      presence.finish(callId, {
        tool: name,
        argsSummary,
        resultSummary: error instanceof Error ? error.message : 'failed',
        entities: [],
        ok: false,
        startedAt,
        activity: activityFor(name, actualInput, true, false),
      });
      throw error;
    } finally {
      context?.signal?.removeEventListener('abort', upstreamAbort);
    }
  };
}
