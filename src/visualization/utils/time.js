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

export function formatDuration(ms) {
  if (ms < 1000) {return `${ms}ms`;}
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {return `${seconds}s`;}
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default { timeAgo, formatDuration };
