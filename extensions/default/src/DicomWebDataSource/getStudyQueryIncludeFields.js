const legacyOHIFStudyQueryIncludeFields = [
  '00081030', // Study Description
  '00080060', // Modality (legacy OHIF default)
];

/**
 * Returns the study-level QIDO include fields as expected by dicomweb-client.
 * A data source may replace OHIF's legacy list when its server enforces the
 * distinction between study-level and series-level tags.
 */
export default function getStudyQueryIncludeFields(configuredFields) {
  return (configuredFields ?? legacyOHIFStudyQueryIncludeFields).join(',');
}
