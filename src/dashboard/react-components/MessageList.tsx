/**
 * MessageList Component
 *
 * Displays a list of messages with threading support,
 * sender avatars, and timestamp formatting.
 */

import React, { useRef, useEffect } from 'react';
import type { Message } from '../types';
import { getAgentColor, getAgentInitials } from '../lib/colors';

export interface MessageListProps {
  messages: Message[];
  currentChannel: string;
  onThreadClick?: (messageId: string) => void;
  highlightedMessageId?: string;
}

export function MessageList({
  messages,
  currentChannel,
  onThreadClick,
  highlightedMessageId,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Filter messages for current channel
  const filteredMessages = messages.filter((msg) => {
    if (currentChannel === 'general') {
      return msg.to === '*' || msg.isBroadcast;
    }
    return msg.from === currentChannel || msg.to === currentChannel;
  });

  if (filteredMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted text-center">
        <EmptyIcon />
        <h3 className="m-0 mb-2 text-base text-text-secondary">No messages yet</h3>
        <p className="m-0 text-sm">
          {currentChannel === 'general'
            ? 'Broadcast messages will appear here'
            : `Messages with ${currentChannel} will appear here`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-4 bg-bg-secondary" ref={listRef}>
      {filteredMessages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          isHighlighted={message.id === highlightedMessageId}
          onThreadClick={onThreadClick}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isHighlighted?: boolean;
  onThreadClick?: (messageId: string) => void;
}

function MessageItem({ message, isHighlighted, onThreadClick }: MessageItemProps) {
  const colors = getAgentColor(message.from);
  const timestamp = formatTimestamp(message.timestamp);

  return (
    <div
      className={`
        flex gap-3 py-2 px-3 rounded-md transition-colors duration-150
        hover:bg-white/[0.03]
        ${isHighlighted ? 'bg-warning-light border-l-[3px] border-l-warning pl-[9px]' : ''}
      `}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-xs text-white"
        style={{ backgroundColor: colors.primary }}
      >
        <span style={{ color: colors.text }}>
          {getAgentInitials(message.from)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="font-semibold text-sm text-text-primary">{message.from}</span>
          {message.to !== '*' && (
            <>
              <span className="text-text-muted text-xs">→</span>
              <span className="font-medium text-sm text-accent">{message.to}</span>
            </>
          )}
          <span className="text-text-muted text-xs ml-auto">{timestamp}</span>
          {message.to === '*' && (
            <span className="text-[10px] py-0.5 px-1.5 rounded uppercase font-medium bg-warning-light text-warning">
              broadcast
            </span>
          )}
        </div>

        <div className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
          {formatMessageBody(message.content)}
        </div>

        {message.replyCount && message.replyCount > 0 && (
          <button
            className="inline-flex items-center gap-1 mt-2 py-1 px-2 bg-bg-hover border border-border rounded text-accent text-xs cursor-pointer transition-all duration-150 hover:bg-bg-active hover:border-border-dark hover:text-accent"
            onClick={() => onThreadClick?.(message.id)}
          >
            <ThreadIcon />
            <span>{message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Format message body with newline preservation and link detection
 */
function formatMessageBody(content: string): React.ReactNode {
  let normalizedContent = content
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalizedContent.split('\n');

  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {formatLine(line)}
    </React.Fragment>
  ));
}

/**
 * Format a single line, detecting URLs
 */
function formatLine(line: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = line.split(urlRegex);

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent no-underline hover:underline hover:text-accent-hover"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string | number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EmptyIcon() {
  return (
    <svg className="mb-4 opacity-50 text-text-muted" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ThreadIcon() {
  return (
    <svg className="opacity-70" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
