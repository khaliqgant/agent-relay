/**
 * ThreadPanel Component
 *
 * Displays a thread view with the original message and all replies.
 * Includes a reply composer for adding messages to the thread.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../types';
import { getAgentColor, getAgentInitials } from '../lib/colors';

export interface ThreadPanelProps {
  /** The original message that started the thread */
  originalMessage: Message | null;
  /** All replies in this thread */
  replies: Message[];
  /** Called when user wants to close the thread panel */
  onClose: () => void;
  /** Called when user sends a reply */
  onReply: (content: string) => Promise<boolean>;
  /** Whether a reply is currently being sent */
  isSending?: boolean;
}

export function ThreadPanel({
  originalMessage,
  replies,
  onClose,
  onReply,
  isSending = false,
}: ThreadPanelProps) {
  const [replyContent, setReplyContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll when new replies arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length]);

  // Focus input when panel opens
  useEffect(() => {
    inputRef.current?.focus();
  }, [originalMessage?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || isSending) return;

    const success = await onReply(replyContent.trim());
    if (success) {
      setReplyContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!originalMessage) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-2">
          <ThreadIcon />
          <span className="font-semibold text-sm text-text-primary">Thread</span>
          <span className="text-text-muted text-xs">
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-primary"
          title="Close thread"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {/* Original Message */}
        <div className="p-4 border-b border-border">
          <ThreadMessage message={originalMessage} isOriginal />
        </div>

        {/* Replies */}
        <div className="p-4 space-y-3">
          {replies.length === 0 ? (
            <div className="text-center text-text-muted text-sm py-8">
              No replies yet. Be the first to reply!
            </div>
          ) : (
            replies.map((reply) => (
              <ThreadMessage key={reply.id} message={reply} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Reply Composer */}
      <div className="p-4 border-t border-border bg-bg-secondary">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply to thread..."
            disabled={isSending}
            rows={1}
            className="flex-1 py-2 px-3 bg-bg-primary border border-border rounded-md text-sm text-text-primary resize-none min-h-[40px] max-h-[100px] overflow-y-auto focus:outline-none focus:border-accent transition-colors placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={!replyContent.trim() || isSending}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? 'Sending...' : 'Reply'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface ThreadMessageProps {
  message: Message;
  isOriginal?: boolean;
}

function ThreadMessage({ message, isOriginal }: ThreadMessageProps) {
  const colors = getAgentColor(message.from);
  const timestamp = formatTimestamp(message.timestamp);

  return (
    <div className={`flex gap-3 ${isOriginal ? '' : 'pl-2'}`}>
      <div
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs"
        style={{ backgroundColor: colors.primary, color: colors.text }}
      >
        {getAgentInitials(message.from)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-text-primary">{message.from}</span>
          {message.to !== '*' && !isOriginal && (
            <>
              <span className="text-text-muted text-xs">→</span>
              <span className="text-sm text-accent">{message.to}</span>
            </>
          )}
          <span className="text-text-muted text-xs">{timestamp}</span>
          {isOriginal && (
            <span className="text-[10px] py-0.5 px-1.5 rounded bg-accent-light text-accent font-medium">
              Original
            </span>
          )}
        </div>

        <div className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
          {formatMessageBody(message.content)}
        </div>
      </div>
    </div>
  );
}

function formatMessageBody(content: string): React.ReactNode {
  const normalizedContent = content
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
          className="text-accent hover:underline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function formatTimestamp(timestamp: string | number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ThreadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-primary">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
