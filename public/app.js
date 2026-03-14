// ── Shared utilities used by dashboard.html and admin.html ──

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format an ISO date string (YYYY-MM-DD) into a human-readable date.
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  // dateStr may be "2024-03-15" — parse as local date
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Format a datetime string into a relative or short absolute timestamp.
 */
function formatDateTime(dtStr) {
  if (!dtStr) return '';
  const d = new Date(dtStr + (dtStr.includes('T') ? '' : ' UTC'));
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1)  return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7)  return `${diffDays}d ago`;

  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/**
 * Return an HTML badge for a claim status.
 */
function badgeHTML(status) {
  const icons = { pending: '⏳', approved: '✓', rejected: '✗' };
  const icon = icons[status] || '';
  return `<span class="badge badge-${status}">${icon} ${status}</span>`;
}

/**
 * Return an HTML chip for a claim category.
 */
function categoryHTML(category) {
  const icons = { groceries: '🛒', ice: '🧊', other: '📦' };
  const icon = icons[category] || '📦';
  return `<span class="category-chip category-${category}">${icon} ${category}</span>`;
}
