import { useWorkspace } from '../workspace/context';
import { filters } from '../shared/constants';
import { downloadCard, downloadStatistics, selectDownloads } from './view-models';

export function useDownloadList(history: boolean) {
  const state = useWorkspace();
  const restricted = !!state.search || (!history && state.filter !== 'all');
  return {
    cards: selectDownloads(state.jobs, history, state.filter, state.search).map((job) =>
      downloadCard(job, state.stale),
    ),
    filters: history ? filters.slice(0, 1) : filters,
    filter: history ? ('all' as const) : state.filter,
    setFilter: state.setFilter,
    search: state.search,
    setSearch: state.setSearch,
    busy: state.busy,
    count: selectDownloads(state.jobs, history, 'all', '').length,
    emptyTitle: restricted
      ? 'No matching downloads'
      : history
        ? 'A fresh start'
        : 'Your next download starts here',
    emptyDescription: restricted
      ? 'Try another search or choose a different filter.'
      : history
        ? 'Completed and cancelled downloads will appear here.'
        : 'Paste a file link and let parallel connections do the heavy lifting. Your files stay right on your device.',
    showAdd: !history && !restricted,
    canAdd: state.canAdd,
    openAdd: state.openAdd,
    act: state.act,
    openDetails: state.openDetails,
    footer: downloadStatistics(state.jobs, state.stale).footer,
  };
}
