import { useDownloadDetails } from '../../services/downloads/use-download-details';
import { DownloadDetailsDialog } from '../../components/dialogs/DownloadDetailsDialog';
import { DiagnosticsWidget } from '../diagnostics/DiagnosticsWidget';

export function DownloadDetailsWidget({ id, onClose }: { id: string; onClose: () => void }) {
  const state = useDownloadDetails(id);
  return (
    <DownloadDetailsDialog
      model={state.model}
      error={state.error}
      logsOpen={state.logsOpen}
      onLogsToggle={state.setLogsOpen}
      onClose={onClose}
      logs={state.logsOpen && <DiagnosticsWidget jobId={id} />}
    />
  );
}
