import getStudyQueryIncludeFields from './getStudyQueryIncludeFields';

describe('study QIDO include fields', () => {
  it('keeps the legacy OHIF fields unless a data source overrides them', () => {
    expect(getStudyQueryIncludeFields()).toBe('00081030,00080060');
  });

  it('uses server-specific study-level fields when configured', () => {
    expect(getStudyQueryIncludeFields(['00081030', '00080061'])).toBe('00081030,00080061');
  });
});
