/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  investigationalUseDialog: {
    option: 'never',
  },
  extensions: [],
  modes: ['@substrate/mode-substrate'],
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  strictZSpacingForVolumeViewport: true,
  studyPrefetcher: {
    enabled: true,
    displaySetsCount: 2,
    maxNumPrefetchRequests: 10,
    order: 'closest',
  },
  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Substrate archive',
        name: 'orthanc',
        wadoUriRoot: '/dicom-web',
        qidoRoot: '/dicom-web',
        wadoRoot: '/dicom-web',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        // Study Description + Modalities in Study. Do not request the
        // series-level Modality tag from Orthanc's /studies endpoint.
        studyQueryIncludeFields: ['00081030', '00080061'],
        dicomUploadEnabled: false,
        bulkDataURI: {
          enabled: true,
        },
        omitQuotationForMultipartRequest: true,
      },
    },
  ],
  httpErrorHandler: error => {
    console.warn(`HTTP Error Handler (status: ${error.status})`, error);
  },
};
