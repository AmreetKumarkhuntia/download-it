import { DownloadStatisticsWidget } from '../widgets/downloads/DownloadStatisticsWidget';
import { DownloadsWidget } from '../widgets/downloads/DownloadsWidget';
export function DownloadsPage() {
  return (
    <>
      <DownloadStatisticsWidget />
      <DownloadsWidget />
    </>
  );
}
