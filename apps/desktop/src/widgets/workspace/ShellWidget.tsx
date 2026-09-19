import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { Page } from '../../types/workspace';
import { useWorkspace } from '../../services/workspace/context';
import { pageLabels } from '../../services/shared/constants';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeading } from '../../components/layout/PageHeading';
import { PreviewNotice, ActionError } from '../../components/layout/WorkspaceNotices';
import { Button } from '../../components/ui/button';
import { EngineStatusWidget } from './EngineStatusWidget';

export function ShellWidget({
  page,
  onPageChange,
  children,
}: {
  page: Page;
  onPageChange: (page: Page) => void;
  children: ReactNode;
}) {
  const state = useWorkspace();
  return (
    <AppShell
      page={page}
      onPageChange={onPageChange}
      downloadCount={state.jobs.length}
      breadcrumb={pageLabels[page].breadcrumb}
    >
      <PageHeading
        title={pageLabels[page].title}
        description={pageLabels[page].description}
        action={
          (page === 'downloads' || page === 'history') && (
            <Button onClick={state.openAdd} disabled={!state.canAdd}>
              <Plus className="icon" /> New download
            </Button>
          )
        }
      />
      {!state.desktopAvailable && <PreviewNotice />}
      {state.error && <ActionError message={state.error} onDismiss={() => state.setError(null)} />}
      <EngineStatusWidget onLogs={() => onPageChange('diagnostics')} />
      {children}
    </AppShell>
  );
}
