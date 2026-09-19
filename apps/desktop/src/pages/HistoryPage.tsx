import { DownloadStatisticsWidget } from '../widgets/downloads/DownloadStatisticsWidget';
import { DownloadsWidget } from '../widgets/downloads/DownloadsWidget';
export function HistoryPage() {
  return (
    <>
      <DownloadStatisticsWidget />
      <DownloadsWidget history />
    </>
  );
}
