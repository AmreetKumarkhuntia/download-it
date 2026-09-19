export type Page = 'downloads' | 'history' | 'settings' | 'diagnostics';
export type Filter = 'all' | 'active' | 'paused' | 'completed';
export type DownloadAction = 'pause' | 'resume' | 'restart' | 'cancel';
export type WorkspaceDialog =
  | { type: 'add' }
  | { type: 'details'; id: string }
  | { type: 'restart'; id: string; filename: string }
  | null;

export interface DownloadDraft {
  url: string;
  destination: string;
  filename: string;
  checksum: string;
}
export interface SettingsDraft {
  maxActiveDownloads: number;
  connectionsPerDownload: number;
  speedLimitKib: number;
  defaultDirectory: string;
}

export interface DownloadCardModel {
  id: string;
  filename: string;
  status: string;
  sourceHost: string;
  size: string;
  icon: 'archive' | 'film' | 'music' | 'file';
  complete: boolean;
  live: boolean;
  canResume: boolean;
  indeterminate: boolean;
  percent: number | null;
  downloaded: string;
  speed: string;
  destination: string;
  error: string | null;
  connections: string;
}

export interface TransferModel {
  connections: string;
  limit: string | null;
  speed: string;
  speedCap: string;
  description: string;
  noRecord: boolean;
  pieces: { label: string; ariaLabel: string; size: string; groups: number[] } | null;
  servers: { origin: string; speed: string }[];
}

export interface DownloadDetailsModel {
  filename: string;
  status: string;
  updated: string;
  error: string | null;
  telemetryError: string | null;
  transfer: TransferModel;
  fields: [string, string][];
}

export interface DiagnosticRow {
  key: string;
  isoTime: string;
  time: string;
  level: string;
  event: string;
  message: string;
  jobId: string | null;
}
