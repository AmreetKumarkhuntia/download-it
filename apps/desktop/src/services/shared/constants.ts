export const timing = { clock: 1000, stale: 10000, details: 2000, diagnostics: 3000 } as const;
export const settingsLimits = {
  active: { min: 1, max: 10 },
  connections: { min: 1, max: 16 },
} as const;
export const bytesPerKib = 1024;
export const filters = [
  { value: 'all', label: 'All files' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
] as const;
export const pageLabels = {
  downloads: {
    breadcrumb: 'Downloads',
    title: 'Your downloads, organized.',
    description: 'Pick up where you left off. We’ll handle the rest.',
  },
  history: {
    breadcrumb: 'History',
    title: 'Your download history',
    description: 'Pick up where you left off. We’ll handle the rest.',
  },
  settings: {
    breadcrumb: 'Preferences',
    title: 'Preferences',
    description: 'Set things up just the way you like.',
  },
  diagnostics: {
    breadcrumb: 'Diagnostics',
    title: 'Activity & diagnostics',
    description: 'Engine health, download events and a record of what went wrong.',
  },
} as const;
export const fileExtensions = {
  archive: ['zip', 'gz', '7z', 'rar', 'iso'],
  film: ['mp4', 'mkv', 'mov'],
  music: ['mp3', 'wav', 'flac'],
} as const;
