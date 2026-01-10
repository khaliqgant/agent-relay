/**
 * useChannelCommands Hook
 *
 * Provides channel-related commands for the CommandPalette.
 * Integrates /create-channel, /join-channel, /leave-channel, /channels commands.
 */

import { useMemo, useCallback } from 'react';
import type { Command } from '../CommandPalette';
import { api } from '../../lib/api';

export interface ChannelInfo {
  id: string;
  name: string;
  memberCount?: number;
}

export interface UseChannelCommandsOptions {
  /** List of channels user has joined */
  joinedChannels: string[];
  /** Callback when user wants to browse channels */
  onBrowseChannels: () => void;
  /** Callback when user wants to create a channel */
  onCreateChannel: () => void;
  /** Callback when a channel is joined */
  onChannelJoined?: (channelName: string) => void;
  /** Callback when a channel is left */
  onChannelLeft?: (channelName: string) => void;
}

export interface UseChannelCommandsReturn {
  /** Commands to add to CommandPalette */
  commands: Command[];
  /** Autocomplete suggestions for channel names */
  getChannelSuggestions: (query: string) => Promise<ChannelInfo[]>;
}

export function useChannelCommands(
  options: UseChannelCommandsOptions
): UseChannelCommandsReturn {
  const {
    joinedChannels,
    onBrowseChannels,
    onCreateChannel,
    onChannelJoined,
    onChannelLeft,
  } = options;

  // Get channel suggestions for autocomplete
  const getChannelSuggestions = useCallback(async (query: string): Promise<ChannelInfo[]> => {
    try {
      const params = new URLSearchParams({
        search: query,
        limit: '10',
      });

      const result = await api.get<{
        channels: Array<{ id: string; name: string; memberCount: number }>;
      }>(`/api/channels/browse?${params.toString()}`);

      return result.channels || [];
    } catch (err) {
      console.error('[useChannelCommands] Failed to get suggestions:', err);
      return [];
    }
  }, []);

  // Join channel action
  const joinChannel = useCallback(async (channelName: string) => {
    try {
      // Normalize channel name
      const normalized = channelName.startsWith('#') ? channelName.slice(1) : channelName;

      await api.post(`/api/channels/${normalized}/join`);
      onChannelJoined?.(`#${normalized}`);
    } catch (err) {
      console.error('[useChannelCommands] Failed to join channel:', err);
    }
  }, [onChannelJoined]);

  // Leave channel action
  const leaveChannel = useCallback(async (channelName: string) => {
    try {
      // Normalize channel name
      const normalized = channelName.startsWith('#') ? channelName.slice(1) : channelName;

      await api.post(`/api/channels/${normalized}/leave`);
      onChannelLeft?.(`#${normalized}`);
    } catch (err) {
      console.error('[useChannelCommands] Failed to leave channel:', err);
    }
  }, [onChannelLeft]);

  // Build commands
  const commands = useMemo((): Command[] => {
    const channelCommands: Command[] = [
      {
        id: 'browse-channels',
        label: 'Browse Channels',
        description: 'Discover and join public channels',
        category: 'channels' as 'actions', // Cast for now since 'channels' category needs to be added
        icon: <HashIcon />,
        shortcut: '/channels',
        action: onBrowseChannels,
      },
      {
        id: 'create-channel',
        label: 'Create Channel',
        description: 'Start a new channel',
        category: 'channels' as 'actions',
        icon: <PlusIcon />,
        shortcut: '/create-channel',
        action: onCreateChannel,
      },
    ];

    // Add leave commands for joined channels
    for (const channel of joinedChannels) {
      const displayName = channel.startsWith('#') ? channel : `#${channel}`;
      channelCommands.push({
        id: `leave-${channel}`,
        label: `Leave ${displayName}`,
        description: 'Leave this channel',
        category: 'channels' as 'actions',
        icon: <LeaveIcon />,
        action: () => leaveChannel(channel),
      });
    }

    return channelCommands;
  }, [joinedChannels, onBrowseChannels, onCreateChannel, leaveChannel]);

  return {
    commands,
    getChannelSuggestions,
  };
}

// Icons
function HashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
