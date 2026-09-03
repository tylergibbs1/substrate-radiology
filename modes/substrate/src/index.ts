import longitudinalMode, {
  extensionDependencies as longitudinalExtensionDependencies,
  longitudinalRoute,
  modeInstance as longitudinalModeInstance,
} from '@ohif/mode-longitudinal';
import substrateExtension from '@substrate/extension-substrate';

import { id } from './id';

const substrateExtensionId = substrateExtension.id;
const { enterSubstrateMode, exitSubstrateMode } = substrateExtension;
const { onModeEnter: enterLongitudinalMode, onModeExit: exitLongitudinalMode } =
  longitudinalModeInstance;

export const extensionDependencies = {
  ...longitudinalExtensionDependencies,
  [substrateExtensionId]: '^0.1.0',
};

// Keep OHIF's longitudinal route and layout byte-for-byte equivalent. Substrate
// augments the viewer lifecycle; it does not fork the diagnostic workspace.
const substrateRoute = longitudinalRoute;

export function onModeEnter(dependencies: withAppTypes): void {
  enterLongitudinalMode.call(this, dependencies);
  enterSubstrateMode(dependencies);
}

export function onModeExit(dependencies: withAppTypes): void {
  try {
    exitSubstrateMode();
  } finally {
    exitLongitudinalMode.call(this, dependencies);
  }
}

export const modeInstance = {
  ...longitudinalModeInstance,
  id,
  onModeEnter,
  onModeExit,
  routes: [substrateRoute],
  extensions: extensionDependencies,
};

const mode = {
  ...longitudinalMode,
  id,
  modeInstance,
  extensionDependencies,
  // The Substrate app loads this enhancer before OHIF's defaults. Explicitly
  // replace the native registration so there is still exactly one /viewer.
  replacesModeIds: [longitudinalMode.id],
};

export default mode;
