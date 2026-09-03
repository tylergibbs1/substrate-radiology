import getReplacedModeIds from './getReplacedModeIds';

describe('getReplacedModeIds', () => {
  it('collects unique, valid replacement declarations', () => {
    const replacements = getReplacedModeIds([
      {
        id: '@substrate/mode-substrate',
        replacesModeIds: ['@ohif/mode-longitudinal', '@ohif/mode-longitudinal', ''],
      },
      { id: '@example/mode', replacesModeIds: ['@example/mode', 42] },
      { id: '@ohif/mode-basic' },
      null,
    ]);

    expect([...replacements]).toEqual(['@ohif/mode-longitudinal']);
  });

  it('does not alter modes without replacement declarations', () => {
    expect(getReplacedModeIds([{ id: '@ohif/mode-longitudinal' }]).size).toBe(0);
  });
});
