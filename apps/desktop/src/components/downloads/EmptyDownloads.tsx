import { ArrowDown, Plus, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../cards/Card';

export function EmptyDownloads({
  title,
  description,
  showAdd,
  canAdd,
  onAdd,
}: {
  title: string;
  description: string;
  showAdd: boolean;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <Card className="empty-state">
      <div className="empty-illustration">
        <div className="empty-orbit" />
        <div className="empty-file">
          <ArrowDown className="icon icon-hero" />
        </div>
        <span className="empty-spark">+</span>
        <span className="empty-dot" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {showAdd && (
        <Button variant="outline" onClick={onAdd} disabled={!canAdd}>
          <Plus className="icon" /> Add your first download
        </Button>
      )}
      <div className="empty-features">
        <span>
          <Zap className="icon icon-xs" /> Parallel connections
        </span>
        <span>
          <ShieldCheck className="icon icon-xs" /> Resume anytime
        </span>
      </div>
    </Card>
  );
}
