/**
 * Formats a date as a human-readable relative time string (e.g. "5m ago", "3d ago").
 *
 * @param {string|number|Date} date - The date to format (any value accepted by `new Date()`)
 * @returns {string} Relative time string, or 'unknown' if the date is invalid
 */
export function timeAgo(date) {
  const ts = new Date(date).getTime();
  if (isNaN(ts)) {
    return 'unknown';
  }
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));

  if (seconds < 60) {return `${seconds}s ago`;}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {return `${hours}h ago`;}
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Formats a duration in milliseconds as a human-readable string (e.g. "150ms", "3s", "2m 30s").
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  if (ms < 1000) {return `${ms}ms`;}
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {return `${seconds}s`;}
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default { timeAgo, formatDuration };
