import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';

import { buildPdf } from './exportReport';
import {
  addVersion,
  clearReport,
  currentVersion,
  pendingRequest,
  requestSignature,
  requestedVersion,
  setSentenceReview,
  sign,
  signedVersion,
  type MeasurementSnapshot,
  type Sentence,
} from './report';

Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: NodeTextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const agentSentence = (): Sentence => ({
  sentenceId: 'sentence-1',
  section: 'Findings',
  text: 'Target 1 measures 8.0 mm.',
  author: {
    type: 'agent',
    label: 'agent',
    owner: 'active-reader',
    delegate: 'substrate',
  },
  provenance: [{ measurementId: 'measurement-1' }],
  replies: [],
  review: 'unreviewed',
});

const snapshot = (value = '8.0 mm'): MeasurementSnapshot => ({
  measurementId: 'measurement-1',
  label: 'target 1',
  value,
  studyInstanceUid: '1.2.3',
  seriesInstanceUid: '1.2.3.4',
  sopInstanceUid: '1.2.3.4.5',
  sopClassUid: '1.2.840.10008.5.1.4.1.1.2',
  frameOfReferenceUid: '1.2.3.9',
  referencedImageId: 'image:1',
});

const evidence = {
  StudyInstanceUID: '1.2.3',
  SeriesInstanceUID: '1.2.3.4',
  SOPInstanceUID: '1.2.3.4.5',
  SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
};

describe('report integrity', () => {
  beforeEach(clearReport);

  it('binds a request to one hash and requires review of every agent sentence', async () => {
    await addVersion('CT', [agentSentence()], { type: 'human', label: 'reader' }, undefined, {
      measurements: [snapshot()],
      evidence,
    });
    requestSignature('Review this exact version.');

    expect(sign('Dr Reader', 'I reviewed it.', [])).toBeNull();
    await setSentenceReview('sentence-1', 'accepted');
    expect(requestedVersion()).toBe(currentVersion());
    expect(sign('Dr Reader', 'I reviewed it.', [])).not.toBeNull();
    expect(signedVersion()?.measurements[0].value).toBe('8.0 mm');

    requestSignature('Review this exact version.');
    await addVersion('changed', currentVersion()!.sentences, { type: 'human', label: 'reader' });
    expect(pendingRequest()).toBeNull();
    expect(requestedVersion()).toBeNull();
  });

  it('rehashes and rebinds a pending request when the signer leaves a sentence out', async () => {
    const removed = {
      ...agentSentence(),
      sentenceId: 'sentence-2',
      text: 'Leave this sentence out.',
      provenance: [],
    };
    await addVersion(
      'CT',
      [{ ...agentSentence(), review: 'accepted' }, removed],
      { type: 'human', label: 'reader' },
      undefined,
      { measurements: [snapshot()], evidence }
    );
    requestSignature('Review this exact version.');
    const originalHash = currentVersion()!.hash;

    await setSentenceReview('sentence-2', 'rejected');

    expect(currentVersion()!.hash).not.toBe(originalHash);
    expect(pendingRequest()?.versionHash).toBe(currentVersion()!.hash);
    expect(requestedVersion()).toBe(currentVersion());
    expect(sign('Dr Reader', 'I reviewed it.', [])).not.toBeNull();
    expect(
      signedVersion()?.sentences.find(sentence => sentence.sentenceId === 'sentence-2')?.review
    ).toBe('rejected');
  });

  it('exports the signed evidence snapshot, never a mutated viewer measurement', async () => {
    const sentence = { ...agentSentence(), review: 'accepted' as const };
    await addVersion('CT', [sentence], { type: 'human', label: 'reader' }, undefined, {
      measurements: [snapshot('8.0 mm')],
      evidence,
    });
    requestSignature('Review this exact version.');
    expect(sign('Dr Reader', 'I reviewed it.', [])).not.toBeNull();

    const pdf = buildPdf({
      measurementService: {
        getMeasurement: () => ({ label: 'mutated', displayText: '99.9 mm' }),
      },
    });
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(pdf);
    });
    expect(text).toContain('target 1: 8.0 mm');
    expect(text).not.toContain('99.9 mm');
  });
});
