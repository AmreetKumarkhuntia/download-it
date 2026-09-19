import type { ReactNode } from 'react';
import { WorkspaceContext } from '../../services/workspace/context';
import { useWorkspaceController } from '../../services/workspace/use-workspace-controller';
import { DownloadDialogsWidget } from '../downloads/DownloadDialogsWidget';

export function WorkspaceWidget({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceController();
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
      <DownloadDialogsWidget />
    </WorkspaceContext.Provider>
  );
}
