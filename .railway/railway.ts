import { defineRailway, github, image, preserve, project, service, volume } from 'railway/iac';

export default defineRailway(() => {
  const orthancData = volume('orthanc-data', {
    alerts: { usage: { '80': {}, '95': {}, '100': {} } },
    allowOnlineResize: true,
    region: 'us-west2',
    sizeMB: 5000,
  });
  const orthanc = service('orthanc', {
    source: image('orthancteam/orthanc:26.8.2-full'),
    replicas: { 'us-west2': 1 },
    deploy: { restartPolicyType: 'ALWAYS', sleepApplication: false },
    volumeMounts: { '/var/lib/orthanc/db': orthancData },
    env: {
      ORTHANC__AUTHENTICATION_ENABLED: preserve(),
      ORTHANC__DICOM_SERVER_ENABLED: preserve(),
      ORTHANC__DICOM_WEB__ENABLE: preserve(),
      ORTHANC__DICOM_WEB__ROOT: preserve(),
      ORTHANC__DICOM_WEB__SERIES_METADATA: preserve(),
      ORTHANC__DICOM_WEB__STUDIES_METADATA: preserve(),
      ORTHANC__HTTP_COMPRESSION_ENABLED: preserve(),
      ORTHANC__HTTP_PORT: preserve(),
      ORTHANC__NAME: preserve(),
      ORTHANC__REGISTERED_USERS: preserve(),
      ORTHANC__REMOTE_ACCESS_ALLOWED: preserve(),
      ORTHANC__STORAGE_COMPRESSION: preserve(),
      PORT: preserve(),
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: preserve(),
      VERBOSE_ENABLED: preserve(),
    },
  });
  const seed = service('seed', {
    source: github('tylergibbs1/substrate-radiology', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'seed/Dockerfile' },
    replicas: { 'us-west2': 1 },
    deploy: {
      startCommand: 'python load.py',
      restartPolicyType: 'NEVER',
      sleepApplication: false,
    },
    env: {
      ORTHANC_SEED_PASSWORD: preserve(),
      ORTHANC_SEED_USER: preserve(),
      ORTHANC_URL: preserve(),
    },
  });
  const edge = service('edge', {
    source: github('tylergibbs1/substrate-radiology', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'deploy/edge/Dockerfile' },
    replicas: { 'us-west2': 1 },
    deploy: {
      healthcheckPath: '/healthz',
      healthcheckTimeout: 300,
      restartPolicyType: 'ALWAYS',
      sleepApplication: false,
    },
    env: { ORTHANC_HOST: preserve(), ORTHANC_READ_BASIC: preserve() },
  });

  return project('Substrate', {
    resources: [orthanc, seed, edge, orthancData],
  });
});
