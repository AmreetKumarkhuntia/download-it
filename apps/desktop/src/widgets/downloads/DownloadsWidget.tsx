import { useDownloadList } from '../../services/downloads/use-download-list';
import { DownloadCard } from '../../components/cards/DownloadCard';
import { DownloadToolbar } from '../../components/downloads/DownloadToolbar';
import { EmptyDownloads } from '../../components/downloads/EmptyDownloads';

export function DownloadsWidget({ history = false }: { history?: boolean }) {
  const view = useDownloadList(history);
  return (
    <>
      <DownloadToolbar
        filters={view.filters}
        selected={view.filter}
        count={view.count}
        search={view.search}
        onFilter={view.setFilter}
        onSearch={view.setSearch}
      />
      <div className="download-list">
        {view.cards.length ? (
          view.cards.map((card) => (
            <DownloadCard
              key={card.id}
              model={card}
              busy={view.busy}
              onAction={view.act}
              onDetails={view.openDetails}
            />
          ))
        ) : (
          <EmptyDownloads
            title={view.emptyTitle}
            description={view.emptyDescription}
            showAdd={view.showAdd}
            canAdd={view.canAdd}
            onAdd={view.openAdd}
          />
        )}
      </div>
      <footer className="page-footer">
        <span>
          <span className="online-dot" /> {view.footer}
        </span>
        <span>Built for the files that matter.</span>
      </footer>
    </>
  );
}
