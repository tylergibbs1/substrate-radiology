jest.mock('../engine/place', () => ({
  findTargetSlice: jest.fn(() => ({ imageId: 'image:prior:50', offsetMm: 0.8, aligned: false })),
  placeProposal: jest.fn(),
}));

jest.mock('../engine/proposals', () => ({
  getProposal: jest.fn(),
  isCitable: jest.fn(),
  reject: jest.fn(() => true),
}));

import { webcrypto } from 'crypto';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { autonomy } from '../engine/autonomy';
import { exportDicomSr, exportPdf } from '../engine/exportReport';
import {
  addReply,
  changeTemplate,
  clearReport,
  currentVersion,
  openReplies,
  pendingRequest,
  sign,
  signatureIsStale,
} from '../engine/report';
import { register, type WebMcpTool } from '../webmcp/spec';
import { buildViewerTools } from '../webmcp/viewerTools';

Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: NodeTextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: NodeTextDecoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const CURRENT_STUDY = '1.2.840.113654.2.55.302957049620416109572494829313844992999';
const CURRENT_SERIES = '1.2.840.113654.2.55.60458735496393490723304567091309771081';
const PRIOR_STUDY = '1.2.840.113654.2.55.8790539037983910932933668152636658031';
const PRIOR_SERIES = '1.2.840.113654.2.55.297188825848849138708491937791320762236';

describe('S1-S7 WebMCP acceptance sequence', () => {
  beforeEach(() => {
    clearReport();
    autonomy.setLevel('full-prep');
    autonomy.setStandingInstructions([]);
    jest.clearAllMocks();
  });

  it('completes the whole workflow while preserving every human-only boundary', async () => {
    const accepted = new Set<string>();
    const proposalIds = ['proposal-target-1', 'proposal-target-2'];
    const proposalModule = jest.requireMock('../engine/proposals') as {
      isCitable: jest.Mock;
    };
    proposalModule.isCitable.mockImplementation((id: string) =>
      id.startsWith('proposal-') ? accepted.has(id) : true
    );
    const placeModule = jest.requireMock('../engine/place') as { placeProposal: jest.Mock };
    placeModule.placeProposal
      .mockReturnValueOnce(proposalIds[0])
      .mockReturnValueOnce(proposalIds[1]);

    const current = {
      displaySetInstanceUID: 'display-current',
      StudyInstanceUID: CURRENT_STUDY,
      SeriesInstanceUID: CURRENT_SERIES,
      StudyDate: '20010102',
      Modality: 'CT',
      numImageFrames: 158,
      imageIds: Array.from({ length: 158 }, (_, index) => `image:current:${index}`),
      instances: Array.from({ length: 158 }, (_, index) => ({
        imageId: `image:current:${index}`,
        ImagePositionPatient: [0, 0, index * 2.5],
        FrameOfReferenceUID: 'frame-current',
        StudyInstanceUID: CURRENT_STUDY,
        SeriesInstanceUID: CURRENT_SERIES,
        SOPInstanceUID: `sop-current-${index}`,
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
        PatientID: '122615',
        StudyDate: '20010102',
        StudyDescription: 'NLST-LSS',
      })),
    };
    const prior = {
      displaySetInstanceUID: 'display-prior',
      StudyInstanceUID: PRIOR_STUDY,
      SeriesInstanceUID: PRIOR_SERIES,
      StudyDate: '20000102',
      Modality: 'CT',
      numImageFrames: 149,
      imageIds: Array.from({ length: 149 }, (_, index) => `image:prior:${index}`),
      instances: Array.from({ length: 149 }, (_, index) => ({
        imageId: `image:prior:${index}`,
        ImagePositionPatient: [0, 0, index * 2.5],
        FrameOfReferenceUID: 'frame-prior',
      })),
    };
    const displaySets = [current, prior];
    const measurements: Array<Record<string, any>> = [];
    const viewports = new Map([
      ['viewport-current', { displaySetInstanceUIDs: ['display-current'] }],
      ['viewport-prior', { displaySetInstanceUIDs: ['display-prior'] }],
    ]);
    const runCommand = jest.fn();
    const setDisplaySetsForViewports = jest.fn(async updates => {
      for (const update of updates) {
        viewports.set(update.viewportId, { displaySetInstanceUIDs: update.displaySetInstanceUIDs });
      }
    });
    const services = {
      viewportGridService: {
        getState: () => ({
          activeViewportId: 'viewport-current',
          viewports,
          layout: { numRows: 1, numCols: 2 },
        }),
        setActiveViewportId: jest.fn(),
        setDisplaySetsForViewports,
      },
      cornerstoneViewportService: {
        getCornerstoneViewport: () => ({
          element: { isConnected: true },
          viewportStatus: 'rendered',
          getCurrentImageIdIndex: () => 50,
          getProperties: () => ({}),
          getCamera: () => ({}),
          render: jest.fn(),
        }),
        getOrientation: () => 'AXIAL',
      },
      displaySetService: {
        getActiveDisplaySets: () => displaySets,
        getDisplaySetByUID: (uid: string) =>
          displaySets.find(displaySet => displaySet.displaySetInstanceUID === uid),
      },
      measurementService: {
        getMeasurements: () => measurements,
        getMeasurement: (uid: string) => measurements.find(measurement => measurement.uid === uid),
        jumpToMeasurement: jest.fn(),
        update: (uid: string, next: Record<string, unknown>) => {
          const index = measurements.findIndex(measurement => measurement.uid === uid);
          if (index >= 0) measurements[index] = next;
        },
      },
      trackedMeasurementsService: { getTrackedSeries: () => [CURRENT_SERIES, PRIOR_SERIES] },
    };
    const tools = buildViewerTools({
      servicesManager: { services },
      commandsManager: { runCommand },
      extensionManager: {},
    });

    // Register and call the same objects exposed to the browser, rather than
    // reaching around WebMCP to invoke internal engine functions.
    const registered = new Map<string, WebMcpTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool: async (tool: WebMcpTool) => void registered.set(tool.name, tool),
      getTools: async () => [...registered.values()],
    });
    Object.defineProperty(document, 'modelContext', { configurable: true, value: modelContext });
    const registration = await register(tools, new AbortController().signal);
    expect(registration).toEqual({ ok: true, registered: tools.map(tool => tool.name) });
    const call = (name: string, input: Record<string, any>) => registered.get(name)!.execute(input);

    // S1 — WebMCP hangs current + prior, axial, with lung windows.
    await expect(
      call('hang_layout', {
        rows: 1,
        cols: 2,
        viewports: [
          { series_uid: CURRENT_SERIES, orientation: 'axial', preset: 'lung' },
          { series_uid: PRIOR_SERIES, orientation: 'axial', preset: 'lung' },
        ],
      })
    ).resolves.toEqual(expect.objectContaining({ rows: 1, cols: 2 }));
    expect(setDisplaySetsForViewports).toHaveBeenCalled();

    // S2 — keyboard/voice intent becomes one deterministic navigation command
    // per step. No pixels or image-derived landmark crosses the tool boundary.
    await call('navigate', { viewport: 'viewport-current', slice_index: 50 });
    for (let slice = 51; slice <= 60; slice += 1) {
      await call('navigate', { viewport: 'viewport-current', slice_index: slice });
    }
    expect(runCommand).toHaveBeenCalledWith('jumpToImage', {
      imageIndex: 60,
      viewport: { id: 'viewport-current' },
    });

    // S3 — these are human-drawn measurements. WebMCP only reads and labels them.
    measurements.push(
      {
        uid: 'current-target-1',
        referenceStudyUID: CURRENT_STUDY,
        referenceSeriesUID: CURRENT_SERIES,
        FrameOfReferenceUID: 'frame-current',
        toolName: 'Bidirectional',
        points: [
          [0, 0, 125],
          [8, 0, 125],
        ],
        displayText: { primary: ['8.0 mm'] },
        metadata: { viewPlaneNormal: [0, 0, 1] },
      },
      {
        uid: 'current-target-2',
        referenceStudyUID: CURRENT_STUDY,
        referenceSeriesUID: CURRENT_SERIES,
        FrameOfReferenceUID: 'frame-current',
        toolName: 'Bidirectional',
        points: [
          [0, 0, 130],
          [6, 0, 130],
        ],
        displayText: { primary: ['6.0 mm'] },
        metadata: { viewPlaneNormal: [0, 0, 1] },
      }
    );
    await expect(call('list_measurements', {})).resolves.toEqual(
      expect.objectContaining({ count: 2 })
    );

    // S4 — WebMCP copies only those sources. The person adjusts one and accepts both.
    const firstProposal = await call('propose_measurement', {
      from_measurement_id: 'current-target-1',
      target_study_uid: PRIOR_STUDY,
      label: 'target 1',
    });
    const secondProposal = await call('propose_measurement', {
      from_measurement_id: 'current-target-2',
      target_study_uid: PRIOR_STUDY,
      label: 'target 2',
    });
    expect(firstProposal).toEqual(expect.objectContaining({ state: 'proposed', aligned: false }));
    expect(secondProposal).toEqual(expect.objectContaining({ state: 'proposed', aligned: false }));
    measurements.push(
      {
        uid: proposalIds[0],
        label: 'target 1',
        referenceStudyUID: PRIOR_STUDY,
        referenceSeriesUID: PRIOR_SERIES,
        toolName: 'Bidirectional',
        displayText: { primary: ['7.5 mm'] }, // adjusted by the radiologist
      },
      {
        uid: proposalIds[1],
        label: 'target 2',
        referenceStudyUID: PRIOR_STUDY,
        referenceSeriesUID: PRIOR_SERIES,
        toolName: 'Bidirectional',
        displayText: { primary: ['6.0 mm'] },
      }
    );
    accepted.add(proposalIds[0]);
    accepted.add(proposalIds[1]);

    // S5 — comparison and draft use accepted measurements only.
    await expect(call('compare_with_prior', { labels: ['target 1', 'target 2'] })).resolves.toEqual(
      expect.objectContaining({
        compared: expect.arrayContaining([
          expect.objectContaining({ label: 'target 1' }),
          expect.objectContaining({ label: 'target 2' }),
        ]),
        not_yet_accepted: 0,
      })
    );
    await call('draft_report', {
      template: 'chest CT, longitudinal',
      sentences: [
        {
          section: 'Findings',
          text: 'Target 1 measures 8.0 mm on the current and 7.5 mm on the prior.',
          cites: ['current-target-1', proposalIds[0]],
        },
        {
          section: 'Impression',
          text: 'Target 2 is unchanged at 6.0 mm.',
          cites: ['current-target-2', proposalIds[1]],
        },
      ],
    });
    const untouchedSentence = currentVersion()!.sentences[1];

    // S6 — a human reply and remeasurement revise only the addressed row.
    const reply = addReply(
      currentVersion()!.sentences[0].sentenceId,
      'Use the corrected current measurement.',
      'edit'
    )!;
    measurements[0].displayText = { primary: ['8.2 mm'] };
    await call('draft_report', {
      template: 'chest CT, longitudinal',
      sentences: [
        {
          section: 'Findings',
          text: 'Target 1 measures 8.2 mm on the current and 7.5 mm on the prior.',
          cites: ['current-target-1', proposalIds[0]],
          replaces_sentence_id: currentVersion()!.sentences[0].sentenceId,
          answers_reply_id: reply.replyId,
        },
      ],
    });
    expect(currentVersion()!.sentences[1]).toEqual(untouchedSentence);
    expect(openReplies()).toEqual([]);

    // S7 — WebMCP can only request. Signing and both exports remain human actions;
    // a subsequent edit makes the next exports visibly stale.
    await expect(
      call('request_signature', {
        draft_id: currentVersion()!.version,
        summary_for_signer: 'Review the two measurement-backed sentences.',
      })
    ).resolves.toEqual(expect.objectContaining({ status: 'pending' }));
    expect(pendingRequest()?.status).toBe('pending');
    expect(
      sign('Dr Acceptance', 'I reviewed the report and take responsibility.', [])
    ).not.toBeNull();
    expect(signatureIsStale()).toBe(false);

    const downloads: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:substrate-acceptance'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    exportDicomSr(services);
    exportPdf(services);
    expect(downloads).toEqual([
      `Substrate-report-v${currentVersion()!.version}.dcm`,
      `Substrate-report-v${currentVersion()!.version}.pdf`,
    ]);

    await changeTemplate('chest CT, longitudinal — amended');
    expect(signatureIsStale()).toBe(true);
    exportDicomSr(services);
    exportPdf(services);
    expect(downloads).toHaveLength(4);
  });
});
