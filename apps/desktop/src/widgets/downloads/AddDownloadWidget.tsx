import { useWorkspace } from '../../services/workspace/context';
import { useAddDownload } from '../../services/downloads/use-add-download';
import { AddDownloadForm } from '../../components/forms/AddDownloadForm';

export function AddDownloadWidget() {
  const workspace = useWorkspace();
  const form = useAddDownload(
    workspace.settings?.defaultDirectory ?? '',
    workspace.add,
    workspace.closeDialog,
  );
  return (
    <AddDownloadForm
      value={form.value}
      busy={workspace.busy}
      error={form.error ?? workspace.error}
      onChange={form.update}
      onSubmit={() => void form.submit()}
      onChooseDirectory={() => void form.chooseDirectory()}
      onClose={workspace.closeDialog}
    />
  );
}
