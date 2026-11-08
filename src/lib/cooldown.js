/**
 * Limits how often something can start; refused starts don’t extend the wait
 * @param {number} interval Milliseconds between starts
 * @param {() => number} [now]
 * @returns {() => boolean} Whether a start is allowed right now
 */
export const createCooldown = (interval, now = Date.now) => {
  let timeStarted = -Infinity;
  return () => {
    const time = now();
    if (time - timeStarted < interval) return false;
    timeStarted = time;
    return true;
  };
};