/**
 * Return mode IDs that loaded modes explicitly replace.
 *
 * Replacement is opt-in. Existing OHIF configurations therefore keep their
 * current mode list and routing behavior.
 */
export default function getReplacedModeIds(modes = []) {
  const replacedModeIds = new Set();

  modes.forEach(mode => {
    if (!Array.isArray(mode?.replacesModeIds)) {
      return;
    }

    mode.replacesModeIds.forEach(modeId => {
      if (typeof modeId === 'string' && modeId && modeId !== mode.id) {
        replacedModeIds.add(modeId);
      }
    });
  });

  return replacedModeIds;
}
