import { desktopAvailable } from '../../services/client/platform-client';
import { useDiagnostics } from '../../services/diagnostics/use-diagnostics';
import { DiagnosticsPanel } from '../../components/diagnostics/DiagnosticsPanel';

export function DiagnosticsWidget({ jobId = null }: { jobId?: string | null }) {
  return desktopAvailable ? (
    <ConnectedDiagnosticsWidget jobId={jobId} />
  ) : (
    <p className="muted">Open the desktop app to view saved diagnostic logs.</p>
  );
}
function ConnectedDiagnosticsWidget({ jobId }: { jobId: string | null }) {
  const state = useDiagnostics(jobId);
  return (
    <DiagnosticsPanel
      rows={state.rows}
      error={state.error}
      loading={state.loading}
      loaded={state.loaded}
      scoped={state.scoped}
      errorsOnly={state.errorsOnly}
      copyStatus={state.copyStatus}
      onErrorsOnly={state.setErrorsOnly}
      onCopy={() => void state.copy()}
    />
  );
}
