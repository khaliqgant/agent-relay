/**
 * CommandPalette Component
 *
 * A Slack/VS Code-style command palette with fuzzy search,
 * keyboard navigation, and categorized commands.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Agent, Project } from '../types';
import { getAgentColor, getAgentInitials } from '../lib/colors';

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: 'agents' | 'actions' | 'navigation' | 'settings' | 'projects';
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

const CATEGORY_ORDER = ['projects', 'agents', 'actions', 'navigation', 'settings'] as const;

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  projects?: Project[];
  currentProject?: string;
  onAgentSelect: (agent: Agent) => void;
  onProjectSelect?: (project: Project) => void;
  onSpawnClick: () => void;
  onSettingsClick?: () => void;
  onGeneralClick?: () => void;
  customCommands?: Command[];
}

export function CommandPalette(props: CommandPaletteProps) {
  if (!props.isOpen) return null;
  return <CommandPaletteContent {...props} />;
}

function CommandPaletteContent({
  onClose,
  agents,
  projects = [],
  currentProject,
  onAgentSelect,
  onProjectSelect,
  onSpawnClick,
  onSettingsClick,
  onGeneralClick,
  customCommands = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(selectedIndex);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Build command list
  const commands = useMemo(() => {
    const cmds: Command[] = [
      ...projects.map((project) => {
        const displayName = project.name || project.path.split('/').pop() || project.id;
        const isCurrent = project.id === currentProject;
        return {
          id: `project-${project.id}`,
          label: displayName,
          description: isCurrent
            ? `Current project • ${project.agents.length} agents`
            : `${project.agents.length} agents`,
          category: 'projects' as const,
          icon: <FolderIcon />,
          action: () => {
            onProjectSelect?.(project);
            onClose();
          },
        };
      }),
      ...agents.map((agent) => ({
        id: `agent-${agent.name}`,
        label: agent.name,
        description: agent.currentTask || agent.status,
        category: 'agents' as const,
        icon: <AgentIcon name={agent.name} />,
        action: () => {
          onAgentSelect(agent);
          onClose();
        },
      })),
      {
        id: 'spawn-agent',
        label: 'Spawn Agent',
        description: 'Launch a new agent instance',
        category: 'actions',
        icon: <PlusIcon />,
        shortcut: '⌘⇧S',
        action: () => {
          onSpawnClick();
          onClose();
        },
      },
      {
        id: 'broadcast',
        label: 'Broadcast Message',
        description: 'Send message to all agents',
        category: 'actions',
        icon: <BroadcastIcon />,
        action: () => {
          onClose();
        },
      },
      {
        id: 'nav-general',
        label: 'Go to #general',
        description: 'View all broadcast messages',
        category: 'navigation',
        icon: <HashIcon />,
        action: () => {
          onGeneralClick?.();
          onClose();
        },
      },
      ...(onSettingsClick
        ? [
            {
              id: 'settings',
              label: 'Settings',
              description: 'Configure dashboard preferences',
              category: 'settings' as const,
              icon: <SettingsIcon />,
              shortcut: '⌘,',
              action: () => {
                onSettingsClick();
                onClose();
              },
            },
          ]
        : []),
      ...customCommands,
    ];
    return cmds;
  }, [agents, projects, currentProject, onAgentSelect, onProjectSelect, onSpawnClick, onSettingsClick, onGeneralClick, onClose, customCommands]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery) ||
        cmd.category.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  const flatCommands = useMemo(() => {
    return CATEGORY_ORDER.flatMap((cat) => groupedCommands[cat] || []);
  }, [groupedCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset state when component mounts (palette opens)
  useEffect(() => {
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, flatCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatCommands[selectedIndexRef.current]) {
            flatCommands[selectedIndexRef.current].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flatCommands, selectedIndex, onClose]);

  const categoryLabels: Record<string, string> = {
    projects: 'Projects',
    agents: 'Agents',
    actions: 'Actions',
    navigation: 'Navigation',
    settings: 'Settings',
  };

  let globalIndex = 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-[1000] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-sidebar-bg border border-sidebar-border rounded-xl w-[560px] max-w-[90vw] max-h-[60vh] flex flex-col shadow-modal animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
          <SearchIcon />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            className="flex-1 border-none text-base font-sans outline-none bg-transparent text-text-primary placeholder:text-text-muted"
            placeholder="Search commands, agents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="bg-sidebar-border border border-sidebar-hover rounded px-1.5 py-0.5 text-xs text-text-muted font-sans">
            ESC
          </kbd>
        </div>

        <div className="flex-1 overflow-y-auto p-2" ref={listRef}>
          {flatCommands.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No results for "{query}"
            </div>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const cmds = groupedCommands[category];
              if (!cmds?.length) return null;
              return (
                <div key={category} className="mb-2">
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider py-2 px-3">
                    {categoryLabels[category] || category}
                  </div>
                  {cmds.map((cmd) => {
                    const idx = globalIndex++;
                    return (
                      <button
                        key={cmd.id}
                        ref={el => { itemRefs.current[idx] = el; }}
                        className={`
                          flex items-center gap-3 w-full py-2.5 px-3 border-none rounded-lg cursor-pointer text-left font-sans transition-colors duration-100
                          ${idx === selectedIndex ? 'bg-accent-light border border-accent/30' : 'bg-transparent hover:bg-sidebar-border'}
                        `}
                        onClick={cmd.action}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <span className="flex items-center justify-center w-7 h-7 text-text-muted">{cmd.icon}</span>
                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-text-primary">{cmd.label}</span>
                          {cmd.description && (
                            <span className="text-xs text-text-muted truncate">{cmd.description}</span>
                          )}
                        </span>
                        {cmd.shortcut && (
                          <kbd className="bg-sidebar-border border border-sidebar-hover rounded px-1.5 py-0.5 text-xs text-text-muted font-sans">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function AgentIcon({ name }: { name: string }) {
  const colors = getAgentColor(name);
  return (
    <div
      className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold"
      style={{ backgroundColor: colors.primary, color: colors.text }}
    >
      {getAgentInitials(name)}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="text-text-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

function BroadcastIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

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

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
