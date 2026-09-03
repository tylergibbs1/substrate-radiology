import { id } from './id'
import { buildViewerTools } from './webmcp/viewerTools'
import { register, type RegistrationResult } from './webmcp/spec'
import { presence } from './webmcp/presence'

/**
 * Substrate: an agent-native radiology workflow, as an OHIF extension.
 *
 * The radiologist reads. The agent does everything around the reading —
 * hanging the study, navigating, keeping measurements organized, matching
 * lesions across timepoints, assembling the report. It cannot interpret an
 * image, and that is enforced by the shape of the tool surface rather than by
 * asking it nicely: no tool returns pixel data, and no tool creates a finding
 * out of the agent's own judgment.
 *
 * The tools live on the mode, not on the app. They are registered in
 * `onModeEnter` against a single AbortController and torn down in
 * `onModeExit`, because registering a duplicate name throws InvalidStateError —
 * so there must never be two controllers alive at once.
 */

let controller: AbortController | null = null

const substrateExtension = {
  id,

  /**
   * Registration happens on mode enter rather than at app start, so the live
   * tool surface always matches the route the radiologist is actually on.
   */
  onModeEnter: async ({ servicesManager, commandsManager, extensionManager }): Promise<void> => {
    // Abort any previous surface and let it settle before registering again.
    // Two live controllers means duplicate names, which throws.
    if (controller) {
      controller.abort()
      controller = null
      await Promise.resolve()
    }

    controller = new AbortController()
    const tools = buildViewerTools({ servicesManager, commandsManager, extensionManager })
    const result: RegistrationResult = await register(tools, controller.signal)
    presence.setRegistration(result)
  },

  onModeExit: (): void => {
    controller?.abort()
    controller = null
    presence.setRegistration({ ok: true, registered: [] })
  },
}

export default substrateExtension
