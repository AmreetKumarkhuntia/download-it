import type { ReactNode } from 'react';
import {
  ArrowDownToLine,
  ChevronRight,
  Clock3,
  FileText,
  FolderDown,
  HardDrive,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import type { Page } from '../../types/workspace';
import { InformationCard } from '../cards/InformationCard';

export function AppShell({
  page,
  onPageChange,
  downloadCount,
  breadcrumb,
  children,
}: {
  page: Page;
  onPageChange: (page: Page) => void;
  downloadCount: number;
  breadcrumb: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onPageChange('downloads');
          }}
        >
          <span className="brand-mark">
            <ArrowDownToLine className="icon icon-brand" />
          </span>
          <span>
            download<span className="brand-accent">it</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={page === 'downloads' ? 'nav-item selected' : 'nav-item'}
            onClick={() => onPageChange('downloads')}
          >
            <FolderDown className="icon icon-nav" />
            <span>Downloads</span>
            <span className="nav-count">{downloadCount}</span>
          </button>
          <button
            className={page === 'history' ? 'nav-item selected' : 'nav-item'}
            onClick={() => onPageChange('history')}
          >
            <Clock3 className="icon icon-nav" />
            <span>History</span>
          </button>
          <button
            className={page === 'settings' ? 'nav-item selected' : 'nav-item'}
            onClick={() => onPageChange('settings')}
          >
            <Settings2 className="icon icon-nav" />
            <span>Preferences</span>
          </button>
          <button
            className={page === 'diagnostics' ? 'nav-item selected' : 'nav-item'}
            onClick={() => onPageChange('diagnostics')}
          >
            <FileText className="icon icon-nav" />
            <span>Diagnostics</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <InformationCard
            icon={<ShieldCheck className="icon icon-status" />}
            title="Yours, locally."
          >
            No cloud. No account.
            <br />
            Just your files.
          </InformationCard>
          <div className="version">
            <span className="online-dot" /> Download It <span>v{__APP_VERSION__}</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight className="icon icon-sm" />
            <span>{breadcrumb}</span>
          </div>
          <span className="local-badge">
            <HardDrive className="icon icon-meta" /> Local workspace
          </span>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
