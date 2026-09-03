jest.mock(
  '@ohif/mode-longitudinal',
  () => {
    const longitudinalRoute = { path: 'longitudinal', layoutInstance: { id: 'native-layout' } };
    const modeInstance = {
      id: '@ohif/mode-longitudinal',
      routeName: 'viewer',
      routes: [longitudinalRoute],
      extensions: { '@ohif/extension-measurement-tracking': '^3.0.0' },
      onModeEnter: jest.fn(),
      onModeExit: jest.fn(),
    };

    return {
      __esModule: true,
      default: {
        id: '@ohif/mode-longitudinal',
        modeInstance,
        extensionDependencies: modeInstance.extensions,
      },
      extensionDependencies: modeInstance.extensions,
      longitudinalRoute,
      modeInstance,
    };
  },
  { virtual: true }
);

jest.mock(
  '@substrate/extension-substrate',
  () => ({
    __esModule: true,
    default: {
      id: '@substrate/extension-substrate',
      enterSubstrateMode: jest.fn(),
      exitSubstrateMode: jest.fn(),
    },
  }),
  { virtual: true }
);

const longitudinalMode = require('@ohif/mode-longitudinal');
const substrateMode = require('./index');

describe('Substrate viewer integration', () => {
  it('makes the Substrate extension part of the mode itself', () => {
    expect(substrateMode.modeInstance.routes[0]).toBe(longitudinalMode.longitudinalRoute);
    expect(substrateMode.modeInstance.routeName).toBe('viewer');
    expect(substrateMode.modeInstance.extensions).toBe(substrateMode.extensionDependencies);
    expect(substrateMode.modeInstance.extensions).toHaveProperty(
      '@substrate/extension-substrate',
      '^0.1.0'
    );
    expect(substrateMode.default.replacesModeIds).toEqual(['@ohif/mode-longitudinal']);
  });
});
