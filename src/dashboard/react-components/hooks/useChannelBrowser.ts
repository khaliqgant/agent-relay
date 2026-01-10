/**
 * useChannelBrowser Hook
 *
 * Manages browsing, searching, and joining channels.
 * Includes debounced search and pagination support.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import { api } from '../../lib/api';

export interface BrowseChannel {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  isJoined: boolean;
  isPrivate: boolean;
  createdAt: string;
}

export interface UseChannelBrowserOptions {
  /** Initial page size (default: 20) */
  pageSize?: number;
  /** Search debounce delay in ms (default: 300) */
  debounceDelay?: number;
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
}

export interface UseChannelBrowserReturn {
  /** List of channels for current page */
  channels: BrowseChannel[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current search query */
  searchQuery: string;
  /** Update search query */
  setSearchQuery: (query: string) => void;
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Total count of channels matching search */
  totalCount: number;
  /** Navigate to a specific page */
  goToPage: (page: number) => void;
  /** Join a channel */
  joinChannel: (channelId: string) => Promise<void>;
  /** Leave a channel */
  leaveChannel: (channelId: string) => Promise<void>;
  /** Refresh the channel list */
  refresh: () => void;
}

export function useChannelBrowser(
  options: UseChannelBrowserOptions = {}
): UseChannelBrowserReturn {
  const {
    pageSize = 20,
    debounceDelay = 300,
    autoFetch = true,
  } = options;

  const [channels, setChannels] = useState<BrowseChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, debounceDelay);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  // Fetch channels from API
  const fetchChannels = useCallback(async (page: number, search: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      });

      if (search.trim()) {
        params.set('search', search.trim());
      }

      const result = await api.get<{
        channels: BrowseChannel[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/api/channels/browse?${params.toString()}`);

      if (result.channels) {
        setChannels(result.channels);
        setTotalCount(result.pagination?.total || result.channels.length);
      } else {
        // API might return different structure - handle gracefully
        setChannels([]);
        setTotalCount(0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch channels';
      setError(message);
      console.error('[useChannelBrowser] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  // Fetch when search or page changes
  useEffect(() => {
    if (autoFetch) {
      fetchChannels(currentPage, debouncedSearchQuery);
    }
  }, [currentPage, debouncedSearchQuery, autoFetch, fetchChannels]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery]);

  // Go to specific page
  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  }, [totalPages]);

  // Join a channel
  const joinChannel = useCallback(async (channelId: string) => {
    try {
      await api.post(`/api/channels/${channelId}/join`);

      // Optimistically update local state
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === channelId
            ? { ...ch, isJoined: true, memberCount: ch.memberCount + 1 }
            : ch
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join channel';
      setError(message);
      throw err;
    }
  }, []);

  // Leave a channel
  const leaveChannel = useCallback(async (channelId: string) => {
    try {
      await api.post(`/api/channels/${channelId}/leave`);

      // Optimistically update local state
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === channelId
            ? { ...ch, isJoined: false, memberCount: Math.max(0, ch.memberCount - 1) }
            : ch
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave channel';
      setError(message);
      throw err;
    }
  }, []);

  // Refresh current view
  const refresh = useCallback(() => {
    fetchChannels(currentPage, debouncedSearchQuery);
  }, [fetchChannels, currentPage, debouncedSearchQuery]);

  return {
    channels,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    currentPage,
    totalPages,
    totalCount,
    goToPage,
    joinChannel,
    leaveChannel,
    refresh,
  };
}
