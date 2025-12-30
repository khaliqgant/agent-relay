/**
 * Sidebar Component
 *
 * Main navigation sidebar with project/agent list, view mode toggle,
 * and quick actions. Supports unified project navigation with nested agents.
 */

import React, { useState } from 'react';
import type { Agent, Project } from '../../types';
import { AgentList } from '../AgentList';
import { ProjectList } from '../ProjectList';

export interface SidebarProps {
  agents: Agent[];
  projects?: Project[];
  currentProject?: string;
  selectedAgent?: string;
  viewMode: 'local' | 'fleet';
  isFleetAvailable: boolean;
  isConnected: boolean;
  /** Mobile: whether sidebar is open */
  isOpen?: boolean;
  onAgentSelect?: (agent: Agent, project?: Project) => void;
  onProjectSelect?: (project: Project) => void;
  onViewModeChange?: (mode: 'local' | 'fleet') => void;
  onSpawnClick?: () => void;
  onReleaseClick?: (agent: Agent) => void;
  /** Mobile: close sidebar handler */
  onClose?: () => void;
}

export function Sidebar({
  agents,
  projects = [],
  currentProject,
  selectedAgent,
  viewMode,
  isFleetAvailable,
  isConnected,
  isOpen = false,
  onAgentSelect,
  onProjectSelect,
  onViewModeChange,
  onSpawnClick,
  onReleaseClick,
  onClose,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Determine if we should show unified project view
  const hasProjects = projects.length > 0;

  return (
    <aside
      className={`
        w-[280px] h-screen flex flex-col border-r
        bg-sidebar-bg text-text-primary border-sidebar-border
        fixed left-0 top-0 z-[1000] -translate-x-full transition-transform duration-200
        md:relative md:translate-x-0 md:z-auto
        ${isOpen ? 'translate-x-0' : ''}
        max-md:w-[85vw] max-md:max-w-[280px]
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-lg font-semibold m-0">Agent Relay</h1>
          <ConnectionIndicator isConnected={isConnected} />
        </div>

        {/* View Mode Toggle */}
        {isFleetAvailable && (
          <div className="flex bg-sidebar-border rounded-md p-0.5">
            <button
              className={`
                flex-1 py-1.5 px-3 bg-transparent border-none text-xs cursor-pointer rounded transition-all duration-200
                ${viewMode === 'local' ? 'bg-sidebar-hover text-white' : 'text-text-muted'}
              `}
              onClick={() => onViewModeChange?.('local')}
            >
              Local
            </button>
            <button
              className={`
                flex-1 py-1.5 px-3 bg-transparent border-none text-xs cursor-pointer rounded transition-all duration-200
                ${viewMode === 'fleet' ? 'bg-sidebar-hover text-white' : 'text-text-muted'}
              `}
              onClick={() => onViewModeChange?.('fleet')}
            >
              Fleet
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 py-3 px-4 bg-sidebar-border m-3 rounded-md">
        <SearchIcon />
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent border-none text-text-primary text-sm outline-none placeholder:text-text-muted"
        />
        {searchQuery && (
          <button
            className="bg-transparent border-none text-text-muted cursor-pointer p-0.5 flex items-center justify-center hover:text-text-secondary"
            onClick={() => setSearchQuery('')}
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* Agent/Project List */}
      <div className="flex-1 overflow-y-auto px-2">
        {hasProjects ? (
          <ProjectList
            projects={projects}
            localAgents={agents}
            currentProject={currentProject}
            selectedAgent={selectedAgent}
            searchQuery={searchQuery}
            onProjectSelect={onProjectSelect}
            onAgentSelect={onAgentSelect}
            onReleaseClick={onReleaseClick}
            compact={true}
          />
        ) : (
          <AgentList
            agents={agents}
            selectedAgent={selectedAgent}
            searchQuery={searchQuery}
            onAgentSelect={(agent) => onAgentSelect?.(agent)}
            onReleaseClick={onReleaseClick}
            compact={true}
            showGroupStats={true}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          className="w-full py-2.5 px-4 bg-sidebar-hover border border-border-dark rounded-md text-text-primary text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors duration-200 hover:bg-bg-active"
          onClick={onSpawnClick}
        >
          <PlusIcon />
          Spawn Agent
        </button>
      </div>
    </aside>
  );
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}
      title={isConnected ? 'Connected' : 'Disconnected'}
    />
  );
}

function SearchIcon() {
  return (
    <svg className="text-text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
