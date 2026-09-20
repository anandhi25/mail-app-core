import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Mail, Paperclip, X, RefreshCw } from 'lucide-react';
import { searchApi, SearchResult } from '../lib/api';
import clsx from 'clsx';

/** Debounce hook */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query.trim(), 300);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInput = containerRef.current?.contains(target);
      const isDropdown = dropdownRef.current?.contains(target);

      if (!isInput && !isDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Recalculate dropdown position when open
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
  }, [isOpen, results, indexing, error]);

  // Run search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    searchApi.search({ q: debouncedQuery, limit: 8 })
      .then(data => {
        if (cancelled) return;
        if (data.indexing) {
          setIndexing(true);
          setResults([]);
        } else {
          setIndexing(false);
          setResults(data.results);
          if (data.error) setError(data.error);
        }
        setIsOpen(true);
        setActiveIndex(-1);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Search unavailable');
          setIsOpen(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleSelect = useCallback((result: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    // Navigate to the folder and open the message
    const folder = result.folder.toLowerCase();
    navigate(`/${folder}?uid=${result.uid}&folder=${encodeURIComponent(result.folder)}`);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSyncClick = () => {
    searchApi.triggerSync('INBOX');
    setIndexing(false);
    setError('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative max-w-xl w-full">
      {/* Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => debouncedQuery.length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          className="w-full bg-gray-100 border-transparent focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg pl-9 pr-9 py-2 text-sm transition-all outline-none border"
        />
        {loading && (
          <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
        )}
        {!loading && query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

    </div>
  );

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      style={{ ...dropdownStyle, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden fixed"
    >
      {/* Indexing state */}
      {indexing && (
        <div className="p-4 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600 font-medium">Indexing your mailbox…</p>
          <p className="text-xs text-gray-400 mt-1">This runs once in the background. Try again in a few seconds.</p>
        </div>
      )}

      {/* Error */}
      {!indexing && error && (
        <div className="p-4 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={handleSyncClick}
            className="mt-2 text-xs text-blue-500 hover:underline flex items-center gap-1 mx-auto"
          >
            <RefreshCw className="w-3 h-3" /> Re-sync mailbox
          </button>
        </div>
      )}

      {/* Results */}
      {!indexing && !error && results.length > 0 && (
        <>
          <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Results
          </div>
          <ul>
            {results.map((result, idx) => (
              <li key={result.id}>
                <button
                  className={clsx(
                    'w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
                    activeIndex === idx && 'bg-blue-50',
                    !result.is_seen && 'font-semibold',
                  )}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  {/* Icon */}
                  <div className="shrink-0 mt-0.5">
                    <Mail className={clsx('w-4 h-4', result.is_seen ? 'text-gray-300' : 'text-blue-500')} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('text-sm truncate', result.is_seen ? 'text-gray-700' : 'text-gray-900')}>
                        {result.from_name || result.from_address}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {result.has_attachment && <Paperclip className="w-3 h-3 text-gray-400" />}
                        <span className="text-[11px] text-gray-400">{formatDate(result.sent_at)}</span>
                      </div>
                    </div>
                    <p className={clsx('text-xs truncate mt-0.5', result.is_seen ? 'text-gray-500' : 'text-gray-800')}>
                      {result.subject || '(no subject)'}
                    </p>
                    {result.snippet && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{result.snippet}</p>
                    )}
                  </div>

                  {/* Folder badge */}
                  <span className="shrink-0 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">
                    {result.folder.toLowerCase()}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2 flex justify-between items-center">
            <span className="text-[11px] text-gray-400">{results.length} results for "{debouncedQuery}"</span>
            <button
              onClick={handleSyncClick}
              className="text-[11px] text-gray-400 hover:text-blue-500 flex items-center gap-1 transition-colors"
              title="Re-sync mailbox index"
            >
              <RefreshCw className="w-3 h-3" /> Sync
            </button>
          </div>
        </>
      )}

      {/* Empty */}
      {!indexing && !error && results.length === 0 && !loading && debouncedQuery.length >= 2 && (
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500">No messages found for "<span className="font-medium">{debouncedQuery}</span>"</p>
          <button
            onClick={handleSyncClick}
            className="mt-2 text-xs text-blue-500 hover:underline flex items-center gap-1 mx-auto"
          >
            <RefreshCw className="w-3 h-3" /> Re-sync mailbox
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div ref={containerRef} className="relative max-w-xl w-full">
        {/* Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => debouncedQuery.length >= 2 && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            className="w-full bg-gray-100 border-transparent focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg pl-9 pr-9 py-2 text-sm transition-all outline-none border"
          />
          {loading && (
            <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
          )}
          {!loading && query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {createPortal(dropdown, document.body)}
    </>
  );
}
