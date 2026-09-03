jest.mock('../engine/place', () => ({
  findTargetSlice: jest.fn(() => ({ imageId: 'image:prior:1', offsetMm: 1.25, aligned: true })),
  placeProposal: jest.fn(() => 'proposal-1'),
}));

jest.mock('../engine/proposals', () => ({
  getProposal: jest.fn(),
  isCitable: jest.fn(() => true),
  reject: jest.fn(() => true),
}));

import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';

import { buildViewerTools } from './viewerTools';
import { autonomy } from '../engine/autonomy';
import { presence } from './presence';
import {
  addReply,
  addVersion,
  clearReport,
  currentVersion,
  openReplies,
  packetFor,
  restoreVersion,
  setSentenceReview,
} from '../engine/report';

Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: NodeTextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

describe('propose_measurement', () => {
  beforeEach(() => {
    for (const request of autonomy.getPending()) autonomy.decide(request.id, 'skip');
    autonomy.setLevel('auto-prep');
    autonomy.setStandingInstructions([]);
    jest.clearAllMocks();
  });

  it('labels the radiologist source measurement before later comparison', async () => {
    const source = {
      uid: 'measurement-current-1',
      referenceStudyUID: 'study-current',
      referenceSeriesUID: 'series-current',
      FrameOfReferenceUID: 'frame-current',
      toolName: 'Length',
      points: [
        [0, 0, 0],
        [10, 0, 0],
      ],
      metadata: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
    };
    const update = jest.fn();
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          measurementService: {
            getMeasurement: jest.fn(() => source),
            getMeasurements: jest.fn(() => [source]),
            jumpToMeasurement: jest.fn(),
            update,
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => [
              {
                displaySetInstanceUID: 'display-prior',
                StudyInstanceUID: 'study-prior',
                SeriesInstanceUID: 'series-prior',
                numImageFrames: 2,
                imageIds: ['image:prior:1'],
                instances: [
                  {
                    imageId: 'image:prior:1',
                    ImagePositionPatient: [0, 0, 1.25],
                    FrameOfReferenceUID: 'frame-prior',
                  },
                ],
              },
            ]),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    });
    const propose = tools.find(tool => tool.name === 'propose_measurement');

    const result = await propose?.execute({
      from_measurement_id: source.uid,
      target_study_uid: 'study-prior',
      label: '  target 1  ',
    });

    expect(update).toHaveBeenCalledWith(
      source.uid,
      expect.objectContaining({ label: 'target 1' }),
      true
    );
    expect(result).toEqual(
      expect.objectContaining({ source_label: 'target 1', label: 'target 1' })
    );

    await presence.getLast()?.undo?.();
    const proposalEngine = jest.requireMock('../engine/proposals') as { reject: jest.Mock };
    expect(proposalEngine.reject).toHaveBeenCalledWith('proposal-1');
    expect(update).toHaveBeenLastCalledWith(source.uid, source, true);
  });

  it('does not change the viewer when an Assist confirmation is skipped', async () => {
    const source = {
      uid: 'measurement-current-1',
      referenceStudyUID: 'study-current',
      FrameOfReferenceUID: 'frame-current',
      toolName: 'Length',
      points: [[0, 0, 0]],
      metadata: { viewPlaneNormal: [0, 0, -1] },
    };
    const update = jest.fn();
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          measurementService: {
            getMeasurement: jest.fn(() => source),
            getMeasurements: jest.fn(() => [source]),
            jumpToMeasurement: jest.fn(),
            update,
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => []),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    });
    const propose = tools.find(tool => tool.name === 'propose_measurement');
    autonomy.setLevel('assist');

    const resultPromise = propose?.execute({
      from_measurement_id: source.uid,
      target_study_uid: 'study-prior',
      label: 'target 1',
    });
    const confirmation = autonomy.getPending()[0];

    expect(confirmation).toEqual(
      expect.objectContaining({ tool: 'propose_measurement', summary: 'labelled target 1' })
    );
    autonomy.decide(confirmation.id, 'skip');

    await expect(resultPromise).resolves.toEqual(expect.objectContaining({ code: 'DECLINED' }));
    expect(update).not.toHaveBeenCalled();
  });
});

describe('study inventory', () => {
  beforeEach(() => {
    autonomy.setLevel('auto-prep');
    jest.clearAllMocks();
  });

  it('retries discovery after the viewer hydrates its first display set', async () => {
    let activeSets: Record<string, unknown>[] = [];
    const searchStudies = jest.fn(async input =>
      'patientId' in input
        ? [
            { studyInstanceUid: 'study-current', date: '20260101' },
            { studyInstanceUid: 'study-prior', date: '20250101' },
          ]
        : [{ studyInstanceUid: 'study-current', date: '20260101', mrn: 'patient-1' }]
    );
    const searchSeries = jest.fn(async studyUid => [
      {
        seriesInstanceUid: `${studyUid}-series`,
        seriesDate: studyUid === 'study-current' ? '20260101' : '20250101',
        modality: 'CT',
        numSeriesInstances: 100,
      },
    ]);
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => activeSets),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {
        getActiveDataSourceOrNull: () => ({
          query: { studies: { search: searchStudies }, series: { search: searchSeries } },
        }),
      },
    });

    await tools.find(tool => tool.name === 'get_context')?.execute({});
    activeSets = [
      {
        displaySetInstanceUID: 'display-current',
        StudyInstanceUID: 'study-current',
        SeriesInstanceUID: 'study-current-series',
        StudyDate: '20260101',
        Modality: 'CT',
        numImageFrames: 100,
      },
    ];
    const result = await tools.find(tool => tool.name === 'get_study')?.execute({});

    expect(result).toEqual(
      expect.objectContaining({
        studies: expect.arrayContaining([
          expect.objectContaining({ study_uid: 'study-current' }),
          expect.objectContaining({ study_uid: 'study-prior' }),
        ]),
      })
    );
  });
});

describe('viewer undo', () => {
  beforeEach(() => {
    autonomy.setLevel('auto-prep');
    jest.clearAllMocks();
  });

  it('returns navigation to the prior slice', async () => {
    const runCommand = jest.fn();
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          viewportGridService: {
            getState: jest.fn(() => ({
              activeViewportId: 'viewport-1',
              viewports: new Map([['viewport-1', {}]]),
              layout: { numRows: 1, numCols: 1 },
            })),
            setActiveViewportId: jest.fn(),
            setDisplaySetsForViewports: jest.fn(),
          },
          cornerstoneViewportService: {
            getCornerstoneViewport: jest.fn(() => ({
              element: { isConnected: true },
              getCurrentImageIdIndex: () => 4,
            })),
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => []),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand },
      extensionManager: {},
    });

    await tools.find(tool => tool.name === 'navigate')?.execute({ slice_index: 10 });
    await presence.getLast()?.undo?.();

    expect(runCommand).toHaveBeenNthCalledWith(1, 'jumpToImage', {
      imageIndex: 10,
      viewport: { id: 'viewport-1' },
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, 'jumpToImage', {
      imageIndex: 4,
      viewport: { id: 'viewport-1' },
    });
  });

  it('maps a patient-space slice location to the nearest image', async () => {
    const runCommand = jest.fn();
    const displaySet = {
      displaySetInstanceUID: 'display-1',
      StudyInstanceUID: 'study-1',
      SeriesInstanceUID: 'series-1',
      instances: [0, 5, 10].map(value => ({ ImagePositionPatient: [0, 0, value] })),
    };
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          viewportGridService: {
            getState: jest.fn(() => ({
              activeViewportId: 'viewport-1',
              viewports: new Map([['viewport-1', { displaySetInstanceUIDs: ['display-1'] }]]),
              layout: { numRows: 1, numCols: 1 },
            })),
            setActiveViewportId: jest.fn(),
            setDisplaySetsForViewports: jest.fn(),
          },
          cornerstoneViewportService: {
            getCornerstoneViewport: jest.fn(() => ({
              element: { isConnected: true },
              getCurrentImageIdIndex: () => 0,
            })),
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => [displaySet]),
            getDisplaySetByUID: jest.fn(() => displaySet),
          },
        },
      },
      commandsManager: { runCommand },
      extensionManager: {},
    });

    await tools.find(tool => tool.name === 'navigate')?.execute({ slice_location_mm: 6 });

    expect(runCommand).toHaveBeenCalledWith('jumpToImage', {
      imageIndex: 1,
      viewport: { id: 'viewport-1' },
    });
  });

  it('restores display properties and camera', async () => {
    const setProperties = jest.fn();
    const setCamera = jest.fn();
    const render = jest.fn();
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          viewportGridService: {
            getState: jest.fn(() => ({
              activeViewportId: 'viewport-1',
              viewports: new Map([['viewport-1', {}]]),
              layout: { numRows: 1, numCols: 1 },
            })),
            setActiveViewportId: jest.fn(),
            setDisplaySetsForViewports: jest.fn(),
          },
          cornerstoneViewportService: {
            getCornerstoneViewport: jest.fn(() => ({
              element: { isConnected: true },
              getProperties: () => ({ voiRange: { lower: -100, upper: 200 } }),
              getCamera: () => ({ parallelScale: 10 }),
              setProperties,
              setCamera,
              render,
            })),
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => []),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    });

    await tools.find(tool => tool.name === 'set_display')?.execute({ preset: 'lung' });
    await presence.getLast()?.undo?.();

    expect(setProperties).toHaveBeenCalledWith({ voiRange: { lower: -100, upper: 200 } });
    expect(setCamera).toHaveBeenCalledWith({ parallelScale: 10 });
    expect(render).toHaveBeenCalled();
  });

  it('stops an in-flight Assist write before it changes the viewer', async () => {
    autonomy.setLevel('assist');
    const runCommand = jest.fn();
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          viewportGridService: {
            getState: jest.fn(() => ({
              activeViewportId: 'viewport-1',
              viewports: new Map([['viewport-1', {}]]),
              layout: { numRows: 1, numCols: 1 },
            })),
            setActiveViewportId: jest.fn(),
            setDisplaySetsForViewports: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand },
      extensionManager: {},
    });

    const result = tools.find(tool => tool.name === 'navigate')?.execute({ slice_index: 9 });
    presence.getLast()?.stop?.();

    await expect(result).resolves.toEqual(expect.objectContaining({ code: 'STOPPED' }));
    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe('get_context autonomy', () => {
  it('reports the level, standing instructions, and pending decisions', async () => {
    autonomy.setLevel('full-prep');
    autonomy.setStandingInstructions(['Put the most recent prior on the right.']);
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          measurementService: {
            getMeasurement: jest.fn(),
            getMeasurements: jest.fn(() => []),
            jumpToMeasurement: jest.fn(),
            update: jest.fn(),
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => []),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    });
    const getContext = tools.find(tool => tool.name === 'get_context');

    await expect(getContext?.execute({})).resolves.toEqual(
      expect.objectContaining({
        autonomy_level: 'full-prep',
        standing_instructions: ['Put the most recent prior on the right.'],
        pending_confirmations: [],
      })
    );

    autonomy.setLevel('auto-prep');
    autonomy.setStandingInstructions([]);
  });
});

describe('report replies', () => {
  beforeEach(() => {
    clearReport();
    autonomy.setLevel('auto-prep');
  });

  it('revises only the replied-to sentence and closes that reply', async () => {
    await addVersion(
      'chest CT, longitudinal',
      [
        {
          sentenceId: 'sentence-1',
          section: 'Findings',
          text: 'Target 1 is unchanged.',
          author: { type: 'agent', label: 'your agent' },
          provenance: [],
          replies: [],
        },
        {
          sentenceId: 'sentence-2',
          section: 'Impression',
          text: 'No interval change.',
          author: { type: 'agent', label: 'your agent' },
          provenance: [],
          replies: [],
        },
      ],
      { type: 'agent', label: 'your agent' }
    );
    const reply = addReply('sentence-1', 'That is the wrong lesion for target 1.', 'edit');
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          measurementService: {
            getMeasurement: jest.fn(),
            getMeasurements: jest.fn(() => []),
            jumpToMeasurement: jest.fn(),
            update: jest.fn(),
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => []),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    });
    const draft = tools.find(tool => tool.name === 'draft_report');

    await draft?.execute({
      template: 'chest CT, longitudinal',
      sentences: [
        {
          section: 'Findings',
          text: 'Target 1 now refers to the corrected measurement.',
          replaces_sentence_id: 'sentence-1',
          answers_reply_id: reply?.replyId,
        },
      ],
    });

    const version = currentVersion();
    expect(version?.sentences).toHaveLength(2);
    expect(version?.sentences[0]).toEqual(
      expect.objectContaining({
        text: 'Target 1 now refers to the corrected measurement.',
        replacesSentenceId: 'sentence-1',
      })
    );
    expect(version?.sentences[1].text).toBe('No interval change.');
    expect(openReplies()).toEqual([]);
  });

  it('keeps rejected suggestions out of the signed packet and restores old versions', async () => {
    await addVersion(
      'general',
      [
        {
          sentenceId: 'keep',
          section: 'Findings',
          text: 'Keep this sentence.',
          author: { type: 'agent', label: 'your agent' },
          provenance: [],
          replies: [],
          review: 'unreviewed',
        },
        {
          sentenceId: 'remove',
          section: 'Findings',
          text: 'Reject this sentence.',
          author: { type: 'agent', label: 'your agent' },
          provenance: [],
          replies: [],
          review: 'unreviewed',
        },
      ],
      { type: 'agent', label: 'your agent' }
    );
    await setSentenceReview('keep', 'accepted');
    const beforeReject = currentVersion()?.version ?? 0;
    await setSentenceReview('remove', 'rejected');

    const packet = packetFor(currentVersion()!) as { sentences: Array<{ text: string }> };
    expect(packet.sentences.map(sentence => sentence.text)).toEqual(['Keep this sentence.']);

    await restoreVersion(beforeReject);
    expect(
      currentVersion()?.sentences.find(sentence => sentence.sentenceId === 'remove')?.review
    ).toBe('unreviewed');
  });

  it('accepts the PRD nested section and provenance shape', async () => {
    const measurement = { uid: 'measurement-1' };
    const tools = buildViewerTools({
      servicesManager: {
        services: {
          measurementService: {
            getMeasurement: jest.fn(() => measurement),
            getMeasurements: jest.fn(() => [measurement]),
            jumpToMeasurement: jest.fn(),
            update: jest.fn(),
          },
          displaySetService: {
            getActiveDisplaySets: jest.fn(() => []),
            getDisplaySetByUID: jest.fn(),
          },
        },
      },
      commandsManager: { runCommand: jest.fn() },
      extensionManager: {},
    });

    await tools
      .find(tool => tool.name === 'draft_report')
      ?.execute({
        template: 'general',
        sections: [
          {
            name: 'Findings',
            sentences: [
              {
                text: 'Target 1 measures 8 mm.',
                provenance: [{ measurement_id: 'measurement-1' }],
              },
            ],
          },
        ],
      });

    expect(currentVersion()?.sentences[0]).toEqual(
      expect.objectContaining({
        section: 'Findings',
        text: 'Target 1 measures 8 mm.',
        provenance: [{ measurementId: 'measurement-1' }],
      })
    );
  });
});
