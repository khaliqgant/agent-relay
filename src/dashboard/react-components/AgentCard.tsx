/**
 * AgentCard Component
 *
 * Displays an agent with hierarchical color coding, status indicator,
 * and attention badge. Inspired by AI Maestro's visual design.
 */

import React from 'react';
import type { Agent } from '../types';
import {
  getAgentColor,
  getAgentInitials,
  STATUS_COLORS,
  type AgentStatus,
} from '../lib/colors';
import { getAgentDisplayName, getAgentBreadcrumb } from '../lib/hierarchy';
import { ThinkingIndicator, ThinkingDot } from './ThinkingIndicator';

export interface AgentCardProps {
  agent: Agent;
  isSelected?: boolean;
  showBreadcrumb?: boolean;
  compact?: boolean;
  displayNameOverride?: string;
  onClick?: (agent: Agent) => void;
  onMessageClick?: (agent: Agent) => void;
  onReleaseClick?: (agent: Agent) => void;
}

export function AgentCard({
  agent,
  isSelected = false,
  showBreadcrumb = false,
  compact = false,
  displayNameOverride,
  onClick,
  onMessageClick,
  onReleaseClick,
}: AgentCardProps) {
  const colors = getAgentColor(agent.name);
  const initials = getAgentInitials(agent.name);
  const displayName = displayNameOverride || getAgentDisplayName(agent.name);
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.offline;

  const handleClick = () => {
    onClick?.(agent);
  };

  const handleMessageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMessageClick?.(agent);
  };

  const handleReleaseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReleaseClick?.(agent);
  };

  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors duration-200
          hover:bg-[rgba(74,158,255,0.08)]
          ${isSelected ? 'bg-[rgba(74,158,255,0.12)] border-l-[3px]' : ''}
        `}
        onClick={handleClick}
        style={{
          borderLeftColor: isSelected ? colors.primary : 'transparent',
        }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center font-semibold text-[10px]"
          style={{ backgroundColor: colors.primary }}
        >
          <span style={{ color: colors.text }}>{initials}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-primary truncate">{displayName}</span>
          {!displayNameOverride && (
            <span className="text-[10px] text-text-muted truncate">{getAgentBreadcrumb(agent.name)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {agent.isSpawned && onReleaseClick && (
            <button
              className="relative bg-transparent border border-transparent text-text-muted p-1 cursor-pointer flex items-center justify-center rounded transition-all duration-200 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-gradient-to-b hover:from-error-light hover:to-[rgba(180,40,40,0.2)] hover:border-error/50 hover:text-error hover:shadow-[0_0_10px_rgba(255,68,68,0.3)] hover:scale-110"
              onClick={handleReleaseClick}
              title="Kill agent"
            >
              <ReleaseIcon />
            </button>
          )}
          {agent.isProcessing ? (
            <ThinkingDot isProcessing={true} />
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
          )}
          {agent.needsAttention && <div className="w-2 h-2 rounded-full bg-red-500" />}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-lg p-3 cursor-pointer transition-all duration-200
        hover:shadow-md hover:-translate-y-px
        ${isSelected ? 'border-2 shadow-[0_0_0_2px_rgba(74,158,255,0.15)]' : 'border'}
      `}
      onClick={handleClick}
      style={{
        backgroundColor: colors.light,
        borderColor: colors.primary,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm relative"
          style={{ backgroundColor: colors.primary }}
        >
          <span style={{ color: colors.text }}>{initials}</span>
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
            style={{ backgroundColor: statusColor }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-text-primary">{displayName}</span>
            {agent.needsAttention && (
              <span className="bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center" title="Needs attention">!</span>
            )}
          </div>
          {showBreadcrumb ? (
            <span className="text-xs text-text-muted truncate block">{getAgentBreadcrumb(agent.name)}</span>
          ) : (
            <span className="text-xs text-text-muted truncate block">{agent.name}</span>
          )}
        </div>
      </div>

      {agent.isProcessing && (
        <div className="mt-2 p-2 bg-indigo-50 rounded flex items-center gap-2 border border-indigo-200">
          <ThinkingIndicator
            isProcessing={true}
            processingStartedAt={agent.processingStartedAt}
            size="medium"
            showElapsed={true}
          />
          <span className="text-xs text-indigo-500 font-medium">Thinking...</span>
        </div>
      )}

      {agent.currentTask && !agent.isProcessing && (
        <div className="mt-2 p-2 bg-bg-hover rounded text-xs">
          <span className="text-text-muted mr-1">Working on:</span>
          <span className="text-text-primary">{agent.currentTask}</span>
        </div>
      )}

      <div className="mt-3 flex justify-between items-center">
        <div className="flex gap-2 text-xs text-text-muted">
          {agent.cli && <span className="bg-bg-hover py-0.5 px-1.5 rounded">{agent.cli}</span>}
          {agent.messageCount !== undefined && agent.messageCount > 0 && (
            <span style={{ color: colors.primary }}>{agent.messageCount} msgs</span>
          )}
          {agent.isSpawned && (
            <span className="bg-accent-light text-accent text-[10px] py-0.5 px-1.5 rounded uppercase font-medium">spawned</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {agent.isSpawned && onReleaseClick && (
            <button
              className="relative bg-gradient-to-b from-[#3a1a1a] to-[#2a0f0f] text-[#ff6b6b] border border-[#4a2020] rounded-md py-1.5 px-2.5 cursor-pointer flex items-center justify-center gap-1 transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,107,107,0.1),0_2px_4px_rgba(0,0,0,0.3)] overflow-hidden hover:bg-gradient-to-b hover:from-[#4a2020] hover:to-[#3a1515] hover:border-[#ff4444] hover:text-[#ff4444] hover:shadow-[inset_0_1px_0_rgba(255,68,68,0.2),0_0_12px_rgba(255,68,68,0.4),0_2px_8px_rgba(0,0,0,0.4)] hover:scale-105 active:scale-[0.98]"
              onClick={handleReleaseClick}
              title="Release agent"
            >
              <ReleaseIcon />
            </button>
          )}
          {onMessageClick && (
            <button
              className="text-white border-none rounded py-1 px-2 cursor-pointer flex items-center justify-center transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: colors.primary }}
              onClick={handleMessageClick}
              title="Send message"
            >
              <MessageIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ReleaseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="release-icon"
    >
      <path
        d="M12 22c5.523 0 10-4.477 10-10a9.96 9.96 0 0 0-3-7.141"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 22C6.477 22 2 17.523 2 12a9.96 9.96 0 0 1 3-7.141"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
