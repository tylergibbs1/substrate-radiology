import { autonomy } from './autonomy';
import { runFullPrep } from './prep';
import type { JsonObject, JsonValue, WebMcpTool } from '../webmcp/spec';

function tool(
  name: string,
  execute: (input: JsonObject) => JsonValue | Promise<JsonValue>
): WebMcpTool {
  return {
    name,
    title: name,
    description: name,
    execute: async input => execute(input),
  };
}

describe('Full prep', () => {
  afterEach(() => autonomy.setLevel('full-prep'));

  it('hangs, presets, proposes, compares, and drafts without an agent', async () => {
    autonomy.setLevel('full-prep');
    const calls: Array<{ name: string; input: JsonObject }> = [];
    const record = (name: string, result: JsonValue) =>
      tool(name, input => {
        calls.push({ name, input });
        return result;
      });
    const tools = [
      record('get_context', {
        study_uid: 'current',
        active_viewport: 'viewport-current',
        panes: [{ viewport: 'viewport-current', series_uid: 'series-current' }],
      }),
      record('get_study', {
        studies: [
          {
            study_uid: 'current',
            study_date: '20260101',
            series: [{ series_uid: 'series-current', image_count: 160 }],
          },
          {
            study_uid: 'prior',
            study_date: '20250101',
            series: [{ series_uid: 'series-prior', image_count: 150 }],
          },
        ],
      }),
      record('hang_layout', {
        rows: 1,
        cols: 2,
        panes: [
          { viewport: 'viewport-current', series_uid: 'series-current' },
          { viewport: 'viewport-prior', series_uid: 'series-prior' },
        ],
      }),
      record('set_display', { applied: ['lung window'] }),
      record('list_measurements', {
        measurements: [
          {
            measurement_id: 'measurement-prior-1',
            study_uid: 'prior',
            label: 'target 1',
            value: '8.2 mm',
            proposed: false,
          },
        ],
      }),
      record('propose_measurement', { proposal_id: 'proposal-1' }),
      record('compare_with_prior', { compared: [] }),
      record('draft_report', { version: 1 }),
    ];

    const result = await runFullPrep(tools, new AbortController().signal, 0);

    expect(result.status).toBe('done');
    expect(calls.filter(call => call.name === 'set_display')).toHaveLength(2);
    expect(calls.find(call => call.name === 'propose_measurement')?.input).toEqual({
      from_measurement_id: 'measurement-prior-1',
      target_study_uid: 'current',
      label: 'target 1',
    });
    expect(calls.find(call => call.name === 'draft_report')?.input).toEqual(
      expect.objectContaining({
        template: 'chest CT, longitudinal',
        sentences: [
          expect.objectContaining({
            text: 'target 1: prior measurement 8.2 mm; current measurement awaits review.',
            cites: ['measurement-prior-1'],
          }),
        ],
      })
    );
  });

  it('stops after comparison when the prior has no labeled measurements', async () => {
    const calls: string[] = [];
    const record = (name: string, result: JsonValue) =>
      tool(name, () => {
        calls.push(name);
        return result;
      });
    const tools = [
      record('get_context', {
        study_uid: 'current',
        active_viewport: 'viewport-current',
        panes: [{ viewport: 'viewport-current', series_uid: 'series-current' }],
      }),
      record('get_study', {
        studies: [
          {
            study_uid: 'current',
            study_date: '20260101',
            series: [{ series_uid: 'series-current', image_count: 160 }],
          },
          {
            study_uid: 'prior',
            study_date: '20250101',
            series: [{ series_uid: 'series-prior', image_count: 150 }],
          },
        ],
      }),
      record('hang_layout', {
        panes: [
          { viewport: 'viewport-current', series_uid: 'series-current' },
          { viewport: 'viewport-prior', series_uid: 'series-prior' },
        ],
      }),
      record('set_display', { applied: ['lung window'] }),
      record('list_measurements', {
        measurements: [
          {
            measurement_id: 'measurement-prior-unlabeled',
            study_uid: 'prior',
            label: '',
            proposed: false,
          },
        ],
      }),
      record('compare_with_prior', { compared: [] }),
      record('draft_report', { version: 1 }),
    ];

    await expect(runFullPrep(tools, new AbortController().signal, 0)).resolves.toEqual({
      status: 'done',
      studyUid: 'current',
      steps: [
        'Hung current and prior',
        'Applied lung window',
        'Proposed 0 labeled measurements',
        'Compared available measurements',
      ],
    });
    expect(calls).toContain('compare_with_prior');
    expect(calls).not.toContain('draft_report');
  });

  it('does nothing when viewer changes require confirmation', async () => {
    autonomy.setLevel('assist');
    const execute = jest.fn();

    await expect(
      runFullPrep([tool('get_context', execute)], new AbortController().signal, 0)
    ).resolves.toEqual({ status: 'skipped', steps: [] });
    expect(execute).not.toHaveBeenCalled();
  });
});
