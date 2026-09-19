import { ArrowDown, CheckCircle2, Zap } from 'lucide-react';
import { useWorkspace } from '../../services/workspace/context';
import { downloadStatistics } from '../../services/downloads/view-models';
import { StatisticCard } from '../../components/cards/StatisticCard';

export function DownloadStatisticsWidget() {
  const { jobs, stale } = useWorkspace();
  const stats = downloadStatistics(jobs, stale);
  return (
    <section className="stats" aria-label="Download statistics">
      <StatisticCard
        icon={<ArrowDown className="icon" />}
        tone="green"
        label="Active downloads"
        value={stats.active}
        unit="in progress"
      />
      <StatisticCard
        icon={<Zap className="icon" />}
        tone="blue"
        label="Total speed"
        value={stats.speed}
        unit={stats.speedUnit}
      />
      <StatisticCard
        icon={<CheckCircle2 className="icon" />}
        tone="purple"
        label="Completed"
        value={stats.completed}
        unit="files saved"
      />
    </section>
  );
}
