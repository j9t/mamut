/** @param {string | undefined} version */
export const parseVersion = (version) => {
  const match = String(version ?? '').match(/^v?(\d+)\.(\d+)(?:\.(\d+))?(-)?/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0), prerelease: Boolean(match[4]) };
};

/**
 * Treats a prerelease of the minimum version as older, and an unparsable version as too old
 * @param {string | undefined} version
 * @param {[number, number, number]} versionMin
 */
export const isAtLeast = (version, [majorMin, minorMin, patchMin]) => {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const difference = parsed.major - majorMin || parsed.minor - minorMin || parsed.patch - patchMin;
  return difference > 0 || (difference === 0 && !parsed.prerelease);
};