import type { ReactNode } from 'react';
import { Card } from './Card';

export function InformationCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="local-note">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </Card>
  );
}
