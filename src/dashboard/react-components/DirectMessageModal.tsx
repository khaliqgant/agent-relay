/**
 * DirectMessageModal Component
 *
 * Modal for direct messaging with users and inviting agents to group conversations.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { UserPresence } from './hooks/usePresence';
import type { Agent, Message } from '../types';
import type { HumanUser } from './MentionAutocomplete';

export interface DirectMessageModalProps {
  /** User to message (null to hide modal) */
  user: UserPresence | null;
  /** Callback when modal should close */
  onClose: () => void;
  /** All messages (for filtering DM conversation) */
  messages: Message[];
  /** Available agents to invite */
  agents: Agent[];
  /** Human users for mentions */
  humanUsers: HumanUser[];
  /** Callback to send a message */
  onSend: (to: string, content: string) => Promise<boolean>;
  /** Callback when typing */
  onTyping?: (isTyping: boolean) => void;
  /** Whether a message is currently being sent */
  isSending?: boolean;
  /** Send error message */
  sendError?: string | null;
  /** Current logged in user */
  currentUser?: { displayName: string; avatarUrl?: string } | null;
}

export function DirectMessageModal({
  user,
  onClose,
  messages,
  agents,
  humanUsers,
  onSend,
  onTyping,
  isSending,
  sendError,
  currentUser,
}: DirectMessageModalProps) {
  const [showInviteAgents, setShowInviteAgents] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Filter messages for this DM conversation
  const dmMessages = useMemo(() => {
    if (!user || !currentUser) return [];

    // For 1:1 DMs, show only direct messages between current user and target user
    if (selectedAgents.length === 0) {
      return messages.filter((msg) => {
        const isDirectToUser = msg.to === user.username && msg.from === currentUser.displayName;
        const isDirectFromUser = msg.from === user.username && msg.to === currentUser.displayName;
        return isDirectToUser || isDirectFromUser;
      });
    }

    // For group conversations, show messages where:
    // - Current user sent to the target user or any selected agent
    // - Target user sent to current user
    // - Any selected agent sent to current user or target user
    const participants = [currentUser.displayName, user.username, ...selectedAgents];

    return messages.filter((msg) => {
      const fromParticipant = participants.includes(msg.from);
      const toParticipant = participants.includes(msg.to);

      // Include if both sender and recipient are in this conversation
      return fromParticipant && toParticipant;
    });
  }, [messages, user, currentUser, selectedAgents]);

  // Determine current recipient (just the user, since handleSend sends to each participant)
  const recipient = useMemo(() => {
    return user?.username || '';
  }, [user]);

  const handleToggleAgent = useCallback((agentName: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentName)
        ? prev.filter((a) => a !== agentName)
        : [...prev, agentName]
    );
  }, []);

  const handleSend = useCallback(async (to: string, content: string) => {
    // If agents are selected, notify each of them
    if (selectedAgents.length > 0) {
      // Send to user
      await onSend(user!.username, content);
      // Send to each agent
      for (const agent of selectedAgents) {
        await onSend(agent, content);
      }
      return true;
    }
    return onSend(to, content);
  }, [selectedAgents, user, onSend]);

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-x-auto md:inset-y-8 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-3xl bg-bg-primary border border-border-subtle rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-secondary">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent-purple flex items-center justify-center text-sm text-white font-medium">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Title */}
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {selectedAgents.length > 0 ? 'Group Message' : 'Direct Message'}
              </h2>
              <p className="text-xs text-text-muted">
                {selectedAgents.length > 0
                  ? `${user.username}, ${selectedAgents.join(', ')}`
                  : user.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Invite Agents Button */}
            <button
              onClick={() => setShowInviteAgents(!showInviteAgents)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showInviteAgents
                  ? 'bg-accent-cyan text-bg-deep'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80'
              }`}
              title="Invite agents to this conversation"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="inline mr-1"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              {selectedAgents.length > 0 ? `${selectedAgents.length} Agents` : 'Invite Agents'}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-bg-tertiary rounded-md transition-colors text-text-muted hover:text-text-primary"
              title="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Agent Selection Panel */}
        {showInviteAgents && (
          <div className="border-b border-border-subtle bg-bg-secondary p-3">
            <p className="text-xs text-text-muted mb-2">
              Select agents to join this conversation:
            </p>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <button
                  key={agent.name}
                  onClick={() => handleToggleAgent(agent.name)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    selectedAgents.includes(agent.name)
                      ? 'bg-accent-cyan text-bg-deep'
                      : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80'
                  }`}
                >
                  {agent.name}
                </button>
              ))}
              {agents.length === 0 && (
                <p className="text-xs text-text-muted">No agents available</p>
              )}
            </div>
          </div>
        )}

        {/* Message List */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
          {dmMessages.length > 0 ? (
            dmMessages.map((msg, idx) => {
              const isFromCurrentUser = currentUser && msg.from === currentUser.displayName;
              const isFromAgent = selectedAgents.includes(msg.from);

              return (
                <div key={idx} className={`flex ${isFromCurrentUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    isFromCurrentUser
                      ? 'bg-accent-cyan text-bg-deep'
                      : isFromAgent
                        ? 'bg-accent-purple/20 text-text-primary border border-accent-purple/30'
                        : 'bg-bg-tertiary text-text-primary'
                  }`}>
                    {!isFromCurrentUser && (
                      <div className="text-xs font-medium mb-1 opacity-70">
                        {msg.from}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                    <div className="text-[10px] mt-1 opacity-60">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-center px-4">
              <div>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="mx-auto mb-3 opacity-40"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1">
                  Send a message to start the conversation
                  {selectedAgents.length > 0 && ` with ${user.username} and ${selectedAgents.join(', ')}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Simple Message Composer */}
        <SimpleComposer
          recipient={recipient}
          onSend={handleSend}
          isSending={isSending}
          error={sendError}
        />
      </div>
    </>
  );
}

/**
 * Simple message composer for DM modal
 */
interface SimpleComposerProps {
  recipient: string;
  onSend: (to: string, content: string) => Promise<boolean>;
  isSending?: boolean;
  error?: string | null;
}

function SimpleComposer({ recipient, onSend, isSending, error }: SimpleComposerProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    const success = await onSend(recipient, message.trim());
    if (success) {
      setMessage('');
    }
  }, [message, recipient, onSend, isSending]);

  return (
    <div className="border-t border-border-subtle bg-bg-secondary p-3">
      {error && (
        <div className="mb-2 text-xs text-error bg-error/10 px-2 py-1 rounded">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          disabled={isSending}
          className="flex-1 bg-bg-tertiary text-text-primary px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!message.trim() || isSending}
          className="px-4 py-2 bg-accent-cyan text-bg-deep rounded-lg text-sm font-medium hover:bg-accent-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
