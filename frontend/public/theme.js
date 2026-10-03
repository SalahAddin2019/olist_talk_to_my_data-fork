// Runs before first paint so a pinned theme never flashes. External file because the
// backend's Content-Security-Policy blocks inline scripts.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage can be unavailable (private mode); the OS preference still applies.
}
