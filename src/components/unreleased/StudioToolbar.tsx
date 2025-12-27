import { Search, X, ChevronDown, Grid3x3, List } from 'lucide-react';
import { useState } from 'react';

type FilterType = 'all' | 'meta_ready' | 'draft';
type SortType = 'newest' | 'oldest' | 'name';
type ViewType = 'grid' | 'list';

interface StudioToolbarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  sortBy: SortType;
  onSortChange: (sort: SortType) => void;
  viewMode: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function StudioToolbar({
  searchTerm,
  onSearchChange,
  activeFilter,
  onFilterChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewChange,
}: StudioToolbarProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Meta Ready', value: 'meta_ready' },
    { label: 'Draft', value: 'draft' },
  ];

  const sortOptions: { label: string; value: SortType }[] = [
    { label: 'Newest', value: 'newest' },
    { label: 'Oldest', value: 'oldest' },
    { label: 'Name', value: 'name' },
  ];

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tracks..."
          className="w-full pl-11 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#1A6CFF] focus:ring-2 focus:ring-[#1A6CFF]/20 transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        )}
      </div>

      {/* Filters, Sort, and View toggle */}
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1">
        {/* Filter chips */}
        <div className="flex gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={[
                'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
                activeFilter === filter.value
                  ? 'bg-[#1A6CFF] text-white shadow-[0_0_18px_rgba(26,108,255,0.4)]'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              ].join(' ')}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium rounded-full flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <span>{sortOptions.find(s => s.value === sortBy)?.label}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {showSortMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSortMenu(false)}
              />
              <div className="absolute top-full right-0 mt-2 w-36 rounded-xl bg-[#0F1419] border border-white/10 shadow-xl z-50 overflow-hidden">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setShowSortMenu(false);
                    }}
                    className={[
                      'w-full px-4 py-2.5 text-xs text-left transition-colors',
                      sortBy === option.value
                        ? 'bg-[#1A6CFF] text-white font-semibold'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-white/5 rounded-full p-1">
          <button
            onClick={() => onViewChange('grid')}
            className={[
              'w-8 h-8 rounded-full flex items-center justify-center transition-all',
              viewMode === 'grid'
                ? 'bg-[#1A6CFF] text-white shadow-[0_0_12px_rgba(26,108,255,0.4)]'
                : 'text-white/40 hover:text-white/60'
            ].join(' ')}
            title="Grid view"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewChange('list')}
            className={[
              'w-8 h-8 rounded-full flex items-center justify-center transition-all',
              viewMode === 'list'
                ? 'bg-[#1A6CFF] text-white shadow-[0_0_12px_rgba(26,108,255,0.4)]'
                : 'text-white/40 hover:text-white/60'
            ].join(' ')}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
