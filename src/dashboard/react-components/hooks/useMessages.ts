/**
 * useMessages Hook
 *
 * React hook for managing message state with filtering,
 * threading, and send functionality.
 */

import { useState, useMemo, useCallback } from 'react';
import type { Message, SendMessageRequest } from '../../types';

export interface UseMessagesOptions {
  messages: Message[];
  currentChannel?: string;
}

export interface UseMessagesReturn {
  // Filtered messages
  messages: Message[];
  threadMessages: (threadId: string) => Message[];

  // Channel/thread state
  currentChannel: string;
  setCurrentChannel: (channel: string) => void;
  currentThread: string | null;
  setCurrentThread: (threadId: string | null) => void;

  // Message actions
  sendMessage: (to: string, content: string, thread?: string) => Promise<boolean>;
  isSending: boolean;
  sendError: string | null;

  // Stats
  totalCount: number;
  unreadCount: number;
}

export function useMessages({
  messages,
  currentChannel: initialChannel = 'general',
}: UseMessagesOptions): UseMessagesReturn {
  const [currentChannel, setCurrentChannel] = useState(initialChannel);
  const [currentThread, setCurrentThread] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Filter messages by current channel
  // Only exclude reply-chain replies (where thread is another message's ID)
  // Keep topic thread messages (where thread is a topic name, not a message ID)
  const filteredMessages = useMemo(() => {
    // Build set of message IDs for efficient lookup
    const messageIds = new Set(messages.map((m) => m.id));

    // Filter out reply-chain replies (thread points to existing message ID)
    // Keep topic thread messages (thread is a name, not a message ID)
    const mainViewMessages = messages.filter((m) => {
      if (!m.thread) return true; // No thread - show it
      // If thread is a message ID, it's a reply - hide it from main view
      // If thread is a topic name, show it
      return !messageIds.has(m.thread);
    });

    if (currentChannel === 'general') {
      return mainViewMessages;
    }
    return mainViewMessages.filter(
      (m) => m.from === currentChannel || m.to === currentChannel
    );
  }, [messages, currentChannel]);

  // Get messages for a specific thread
  const threadMessages = useCallback(
    (threadId: string) => messages.filter((m) => m.thread === threadId),
    [messages]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const unread = messages.filter((m) => !m.isRead).length;
    return {
      totalCount: messages.length,
      unreadCount: unread,
    };
  }, [messages]);

  // Send message function
  const sendMessage = useCallback(
    async (to: string, content: string, thread?: string): Promise<boolean> => {
      setIsSending(true);
      setSendError(null);

      try {
        const request: SendMessageRequest = {
          to,
          message: content,
          thread,
        };

        const response = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });

        const result = await response.json() as { success?: boolean; error?: string };

        if (response.ok && result.success) {
          return true;
        }

        setSendError(result.error || 'Failed to send message');
        return false;
      } catch (_error) {
        setSendError('Network error');
        return false;
      } finally {
        setIsSending(false);
      }
    },
    []
  );

  return {
    messages: filteredMessages,
    threadMessages,
    currentChannel,
    setCurrentChannel,
    currentThread,
    setCurrentThread,
    sendMessage,
    isSending,
    sendError,
    ...stats,
  };
}
