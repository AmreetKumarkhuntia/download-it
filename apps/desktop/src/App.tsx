import { useState } from 'react';
import type { Page } from './types/workspace';
import { WorkspaceWidget } from './widgets/workspace/WorkspaceWidget';
import { ShellWidget } from './widgets/workspace/ShellWidget';
import { DownloadsPage } from './pages/DownloadsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';

const pages = {
  downloads: DownloadsPage,
  history: HistoryPage,
  settings: SettingsPage,
  diagnostics: DiagnosticsPage,
};
export function App() {
  const [page, setPage] = useState<Page>('downloads');
  const CurrentPage = pages[page];
  return (
    <WorkspaceWidget>
      <ShellWidget page={page} onPageChange={setPage}>
        <CurrentPage />
      </ShellWidget>
    </WorkspaceWidget>
  );
}
