/**
 * Header Component
 *
 * Top navigation bar with current context, quick actions,
 * and command palette trigger.
 */

import React from 'react';
import type { Agent } from '../../types';
import { getAgentColor, getAgentInitials } from '../../lib/colors';
import { getAgentBreadcrumb } from '../../lib/hierarchy';

export interface HeaderProps {
  currentChannel: string;
  selectedAgent?: Agent | null;
  onCommandPaletteOpen?: () => void;
  onSettingsClick?: () => void;
  /** Mobile: open sidebar handler */
  onMenuClick?: () => void;
}

export function Header({
  currentChannel,
  selectedAgent,
  onCommandPaletteOpen,
  onSettingsClick,
  onMenuClick,
}: HeaderProps) {
  const isGeneral = currentChannel === 'general';
  const colors = selectedAgent ? getAgentColor(selectedAgent.name) : null;

  return (
    <header className="h-[52px] bg-bg-secondary border-b border-border flex items-center justify-between px-4">
      {/* Mobile hamburger menu button */}
      <button
        className="hidden max-md:flex items-center justify-center w-11 h-11 bg-transparent border-none text-text-primary cursor-pointer rounded-md transition-colors hover:bg-bg-hover"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isGeneral ? (
          <>
            <span className="text-text-muted text-base">#</span>
            <span className="font-semibold text-[15px] text-text-primary max-md:max-w-[150px] max-md:truncate">general</span>
            <span className="text-text-muted text-sm ml-2 pl-2 border-l border-border max-md:hidden">
              All agent communications
            </span>
          </>
        ) : selectedAgent ? (
          <>
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center font-semibold text-xs"
              style={{ backgroundColor: colors?.primary }}
            >
              <span style={{ color: colors?.text }}>
                {getAgentInitials(selectedAgent.name)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-[15px] text-text-primary max-md:max-w-[150px] max-md:truncate">
                {selectedAgent.name}
              </span>
              <span className="text-text-muted text-xs max-md:hidden">
                {getAgentBreadcrumb(selectedAgent.name)}
              </span>
            </div>
            {selectedAgent.status && (
              <span className="bg-bg-hover text-text-secondary text-xs py-0.5 px-2 rounded ml-2">
                {selectedAgent.status}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-text-muted text-base">@</span>
            <span className="font-semibold text-[15px] text-text-primary">{currentChannel}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 py-1.5 px-3 bg-bg-hover border border-border rounded-md text-text-secondary text-sm cursor-pointer transition-all duration-200 hover:bg-bg-active hover:text-text-primary"
          onClick={onCommandPaletteOpen}
          title="Command Palette (⌘K)"
        >
          <SearchIcon />
          <span className="max-md:hidden">Search</span>
          <kbd className="bg-bg-tertiary border border-border rounded px-1 py-0.5 text-xs text-text-muted max-md:hidden">
            ⌘K
          </kbd>
        </button>

        <a
          href="/metrics"
          className="flex items-center justify-center p-1.5 bg-bg-hover border border-border rounded-md text-text-secondary cursor-pointer transition-all duration-200 hover:bg-bg-active hover:text-text-primary no-underline"
          title="Metrics"
        >
          <MetricsIcon />
        </a>

        <button
          className="flex items-center justify-center p-1.5 bg-bg-hover border border-border rounded-md text-text-secondary cursor-pointer transition-all duration-200 hover:bg-bg-active hover:text-text-primary"
          onClick={onSettingsClick}
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function MetricsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
