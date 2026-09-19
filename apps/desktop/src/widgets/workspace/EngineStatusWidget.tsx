import { useWorkspace } from '../../services/workspace/context';
import { engineStatus } from '../../services/workspace/view-models';
import { EngineStatus } from '../../components/layout/WorkspaceNotices';

export function EngineStatusWidget({ onLogs }: { onLogs: () => void }) {
  const { health, stale, desktopAvailable } = useWorkspace();
  return desktopAvailable ? (
    <EngineStatus {...engineStatus(health, stale)} stale={stale} onLogs={onLogs} />
  ) : null;
}
