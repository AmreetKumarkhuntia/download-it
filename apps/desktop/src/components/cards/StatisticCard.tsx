import type { ReactNode } from 'react';
import { Card } from './Card';

export function StatisticCard({
  icon,
  tone,
  label,
  value,
  unit,
}: {
  icon: ReactNode;
  tone: 'green' | 'blue' | 'purple';
  label: string;
  value: string | number;
  unit: string;
}) {
  return (
    <Card className="stat">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div>
        <span className="stat-label">{label}</span>
        <strong>
          {value}
          <span>{unit}</span>
        </strong>
      </div>
    </Card>
  );
}
