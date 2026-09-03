/**
 * Substrate against a local Orthanc holding only the series the demo opens.
 *
 * The imaging is real and comes from the NCI Imaging Data Commons, but it is
 * served from here rather than read from IDC's proxy at demo time. That proxy
 * is quota-limited per IP and per day and took tens of seconds to stream one
 * series, which is fatal for a recorded walkthrough: the panes sit black while
 * the agent reports success.
 *
 * Seeded case: NLST participant 122615, annual low-dose chest CT screening
 * rounds on 2000-01-02 and 2001-01-02. A real one-year interval on one patient
 * is what makes lesion propagation across timepoints demonstrable at all.
 * NLST in IDC is CC BY 4.0 — VERIFY per series and bundle IDC's attribution
 * before this appears anywhere public.
 *
 * Setup:
 *   docker run -d --name substrate-orthanc -p 8042:8042 \
 *     -e ORTHANC__DICOM_WEB__ENABLE=true \
 *     -e ORTHANC__AUTHENTICATION_ENABLED=false \
 *     -e ORTHANC__REMOTE_ACCESS_ALLOWED=true orthancteam/orthanc
 *   python3 scripts/seed-orthanc.py
 *   yarn dev:substrate
 *
 * The roots are the relative path /pacs/dicom-web rather than localhost:8042,
 * because Orthanc sends no CORS headers and the viewer is a different origin.
 * The dev server proxies that path to Orthanc, so the browser only ever talks
 * to its own origin. A deployment does the same with a reverse proxy instead
 * of opening Orthanc up.
 *
 * These data-source options are OHIF's own for Orthanc. They differ from the
 * AWS static-WADO defaults in ways that matter: staticWado, singlepart and
 * bulkDataURI are settings for a static file dump and make Cornerstone's image
 * requests fail against a real DICOMweb server.
 */
/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],
  // below flag is for performance reasons, but it might not work for all servers
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
  defaultDataSourceName: 'orthancProxy',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthancProxy',
      configuration: {
        friendlyName: 'Substrate local archive',
        name: 'Orthanc',
        wadoUriRoot: '/wado',
        qidoRoot: '/pacs/dicom-web',
        wadoRoot: '/pacs/dicom-web',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        dicomUploadEnabled: true,
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif',
      configuration: {
        friendlyName: 'AWS S3 Static wado server',
        name: 'aws',
        wadoUriRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        wadoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: false,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
          transform: url => url.replace('/pixeldata.mp4', '/rendered'),
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'local5000',
      configuration: {
        friendlyName: 'Static WADO Local Data',
        name: 'DCM4CHEE',
        qidoRoot: 'http://localhost:5000/dicomweb',
        wadoRoot: 'http://localhost:5000/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: true,
        supportsStow: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'video',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
  ],
  httpErrorHandler: error => {
    console.warn(`HTTP Error Handler (status: ${error.status})`, error);
  },
};
