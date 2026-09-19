import { Search } from 'lucide-react';
import type { Filter } from '../../types/workspace';

export function DownloadToolbar({
  filters,
  selected,
  count,
  search,
  onFilter,
  onSearch,
}: {
  filters: readonly { value: Filter; label: string }[];
  selected: Filter;
  count: number;
  search: string;
  onFilter: (filter: Filter) => void;
  onSearch: (search: string) => void;
}) {
  return (
    <div className="list-toolbar">
      <div className="filters" role="group" aria-label="Filter downloads">
        {filters.map((filter) => (
          <button
            key={filter.value}
            className={selected === filter.value ? 'filter active' : 'filter'}
            onClick={() => onFilter(filter.value)}
          >
            {filter.label}
            {filter.value === 'all' && <span>{count}</span>}
          </button>
        ))}
      </div>
      <div className="search">
        <Search className="icon" />
        <input
          aria-label="Search downloads"
          placeholder="Search files…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
    </div>
  );
}
