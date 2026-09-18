import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderDown,
  HardDrive,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import type { JobView } from '@dm/contracts';
import { Button } from '../components/ui/button';
import { AddDownload } from '../features/downloads/AddDownload';
import { DownloadCard } from '../features/downloads/DownloadCard';
import { useDownloads } from '../features/downloads/use-downloads';
import { bytes } from '../features/downloads/format';
import { SettingsPanel } from '../features/settings/SettingsPanel';
import { client, desktopAvailable } from '../services/download-client';

type Page = 'downloads' | 'history' | 'settings';
type Filter = 'all' | 'active' | 'paused' | 'completed';

export function App() {
  const { jobs, settings, setSettings, error, setError, busy, run } = useDownloads();
  const [page, setPage] = useState<Page>('downloads');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [restart, setRestart] = useState<JobView | null>(null);
  const active = jobs.filter((j) => ['downloading', 'queued', 'verifying'].includes(j.status));
  const completed = jobs.filter((j) => j.status === 'completed');
  const speed = active.reduce((n, j) => n + j.speedBytes, 0);
  const filtered = jobs.filter((j) => {
    if (page === 'history' && !['completed', 'cancelled'].includes(j.status)) return false;
    if (
      page === 'downloads' &&
      filter === 'active' &&
      !['downloading', 'queued', 'verifying'].includes(j.status)
    )
      return false;
    if (page === 'downloads' && filter === 'paused' && j.status !== 'paused') return false;
    if (page === 'downloads' && filter === 'completed' && j.status !== 'completed') return false;
    return `${j.filename} ${j.sourceHost}`.toLowerCase().includes(search.toLowerCase());
  });
  const action = (type: 'pause' | 'resume' | 'restart' | 'cancel', job: JobView) => {
    if (type === 'restart') {
      setRestart(job);
      return;
    }
    void run(() =>
      type === 'pause'
        ? client.pause(job.id)
        : type === 'cancel'
          ? client.cancel(job.id)
          : client.resume(job.id),
    );
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('downloads');
          }}
        >
          <span className="brand-mark">
            <ArrowDownToLine size={23} />
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
            onClick={() => setPage('downloads')}
          >
            <FolderDown size={18} />
            <span>Downloads</span>
            <span className="nav-count">{jobs.length}</span>
          </button>
          <button
            className={page === 'history' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setPage('history')}
          >
            <Clock3 size={18} />
            <span>History</span>
          </button>
          <button
            className={page === 'settings' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setPage('settings')}
          >
            <Settings2 size={18} />
            <span>Preferences</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Yours, locally.</strong>
              <p>
                No cloud. No account.
                <br />
                Just your files.
              </p>
            </div>
          </div>
          <div className="version">
            <span className="online-dot" /> Download It <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>
              {page === 'settings' ? 'Preferences' : page === 'history' ? 'History' : 'Downloads'}
            </span>
          </div>
          <span className="local-badge">
            <HardDrive size={13} /> Local workspace
          </span>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE LESS WAITING</div>
              <h1>
                {page === 'settings'
                  ? 'Preferences'
                  : page === 'history'
                    ? 'Your download history'
                    : 'Your downloads, organized.'}
              </h1>
              <p>
                {page === 'settings'
                  ? 'Set things up just the way you like.'
                  : 'Pick up where you left off. We’ll handle the rest.'}
              </p>
            </div>
            {page !== 'settings' && (
              <Button onClick={() => setAdding(true)} disabled={!desktopAvailable || !settings}>
                <Plus size={17} /> New download
              </Button>
            )}
          </div>
          {!desktopAvailable && (
            <div className="preview-note">
              <HardDrive size={17} />
              <span>
                You’re viewing the web preview. Open the desktop app to download files to your
                device.
              </span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {page === 'settings' ? (
            settings ? (
              <SettingsPanel
                settings={settings}
                busy={busy}
                save={async (value) => {
                  const ok = await run(() => client.saveSettings(value));
                  if (ok) setSettings(value);
                  return ok;
                }}
              />
            ) : (
              <div className="empty-state">
                <Settings2 />
                <h2>Preferences live in the desktop app</h2>
                <p>Launch Download It to choose your download folder and connection limits.</p>
              </div>
            )
          ) : (
            <>
              <section className="stats" aria-label="Download statistics">
                <div className="stat">
                  <span className="stat-icon green">
                    <ArrowDown size={19} />
                  </span>
                  <div>
                    <span className="stat-label">Active downloads</span>
                    <strong>
                      {active.length}
                      <span>in progress</span>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon blue">
                    <Zap size={19} />
                  </span>
                  <div>
                    <span className="stat-label">Total speed</span>
                    <strong>
                      {bytes(speed)}
                      <span>/ second</span>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon purple">
                    <CheckCircle2 size={19} />
                  </span>
                  <div>
                    <span className="stat-label">Completed</span>
                    <strong>
                      {completed.length}
                      <span>files saved</span>
                    </strong>
                  </div>
                </div>
              </section>
              <div className="list-toolbar">
                <div className="filters" role="group" aria-label="Filter downloads">
                  {(page === 'history'
                    ? (['all'] as Filter[])
                    : (['all', 'active', 'paused', 'completed'] as Filter[])
                  ).map((item) => (
                    <button
                      key={item}
                      className={filter === item ? 'filter active' : 'filter'}
                      onClick={() => setFilter(item)}
                    >
                      {item === 'all' ? 'All files' : item[0].toUpperCase() + item.slice(1)}
                      {item === 'all' && (
                        <span>
                          {page === 'history'
                            ? jobs.filter((j) => ['completed', 'cancelled'].includes(j.status))
                                .length
                            : jobs.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search downloads"
                    placeholder="Search files…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="download-list">
                {filtered.length ? (
                  filtered.map((job) => (
                    <DownloadCard key={job.id} job={job} busy={busy} onAction={action} />
                  ))
                ) : (
                  <div className="empty-state">
                    <div className="empty-illustration">
                      <div className="empty-orbit" />
                      <div className="empty-file">
                        <ArrowDown size={32} />
                      </div>
                      <span className="empty-spark">+</span>
                      <span className="empty-dot" />
                    </div>
                    <h2>
                      {search || filter !== 'all'
                        ? 'No matching downloads'
                        : page === 'history'
                          ? 'A fresh start'
                          : 'Your next download starts here'}
                    </h2>
                    <p>
                      {search || filter !== 'all'
                        ? 'Try another search or choose a different filter.'
                        : page === 'history'
                          ? 'Completed and cancelled downloads will appear here.'
                          : 'Paste a file link and let parallel connections do the heavy lifting. Your files stay right on your device.'}
                    </p>
                    {page === 'downloads' && !search && filter === 'all' && (
                      <Button
                        variant="outline"
                        onClick={() => setAdding(true)}
                        disabled={!desktopAvailable || !settings}
                      >
                        <Plus size={16} /> Add your first download
                      </Button>
                    )}
                    <div className="empty-features">
                      <span>
                        <Zap size={13} /> Parallel connections
                      </span>
                      <span>
                        <ShieldCheck size={13} /> Resume anytime
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <footer className="page-footer">
                <span>
                  <span className="online-dot" />{' '}
                  {active.length ? 'Downloads in progress' : 'Ready when you are'}
                </span>
                <span>Built for the files that matter.</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {adding && (
        <AddDownload
          directory={settings?.defaultDirectory ?? ''}
          busy={busy}
          externalError={error}
          onClose={() => setAdding(false)}
          onAdd={(request) => run(() => client.add(request))}
        />
      )}
      {restart && (
        <RestartDialog
          job={restart}
          busy={busy}
          onClose={() => setRestart(null)}
          onConfirm={async () => {
            if (await run(() => client.resume(restart.id, true))) setRestart(null);
          }}
        />
      )}
    </div>
  );
}

function RestartDialog({
  job,
  busy,
  onClose,
  onConfirm,
}: {
  job: JobView;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>Restart this download?</h2>
      <p className="muted">
        The incomplete data for {job.filename} will be discarded and downloaded again. Existing
        completed files are kept.
      </p>
      <div className="dialog-footer">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Keep progress
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void onConfirm()}>
          {busy ? 'Restarting…' : 'Restart download'}
        </Button>
      </div>
    </dialog>
  );
}
