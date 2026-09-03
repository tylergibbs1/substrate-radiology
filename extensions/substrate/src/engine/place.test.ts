jest.mock('@cornerstonejs/tools', () => ({ annotation: { state: { addAnnotation: jest.fn() } } }), {
  virtual: true,
});

import { findTargetSlice, placeProposal } from './place';

describe('proposal geometry', () => {
  it('uses only positions in the same DICOM frame of reference', () => {
    expect(
      findTargetSlice(
        [0, 0, 9],
        'frame-a',
        [0, 0, 1],
        [
          { imageId: 'wrong-frame', position: [0, 0, 9], frameOfReferenceUID: 'frame-b' },
          { imageId: 'same-frame', position: [0, 0, 10], frameOfReferenceUID: 'frame-a' },
        ]
      )
    ).toEqual({ imageId: 'same-frame', offsetMm: 1, aligned: true });
    expect(
      findTargetSlice(
        [0, 0, 9],
        'frame-a',
        [0, 0, 1],
        [{ imageId: 'wrong-frame', position: [0, 0, 9], frameOfReferenceUID: 'frame-b' }]
      )
    ).toBeNull();
  });

  it('refuses to copy raw points into a different frame', () => {
    expect(() =>
      placeProposal(
        {
          uid: 'measurement-1',
          toolName: 'Length',
          points: [[0, 0, 0]],
          FrameOfReferenceUID: 'frame-a',
          metadata: {},
        },
        { imageId: 'image:1', offsetMm: 0, aligned: false },
        { seriesUID: 'series-b', studyUID: 'study-b', frameOfReferenceUID: 'frame-b' },
        'target 1'
      )
    ).toThrow(/without registration/);
  });
});
