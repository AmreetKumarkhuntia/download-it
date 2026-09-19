import { useWorkspace } from '../../services/workspace/context';
import { RestartDialog } from '../../components/dialogs/RestartDialog';
import { AddDownloadWidget } from './AddDownloadWidget';
import { DownloadDetailsWidget } from './DownloadDetailsWidget';

export function DownloadDialogsWidget() {
  const { dialog, closeDialog, busy, confirmRestart } = useWorkspace();
  if (dialog?.type === 'add') return <AddDownloadWidget />;
  if (dialog?.type === 'details')
    return <DownloadDetailsWidget key={dialog.id} id={dialog.id} onClose={closeDialog} />;
  if (dialog?.type === 'restart')
    return (
      <RestartDialog
        filename={dialog.filename}
        busy={busy}
        onClose={closeDialog}
        onConfirm={() => void confirmRestart()}
      />
    );
  return null;
}
