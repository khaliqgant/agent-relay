/**
 * Dashboard V2 - Main Application Component
 *
 * Root component that combines sidebar, header, and main content area.
 * Manages global state via hooks and provides context to child components.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Agent, Project } from '../types';
import { Sidebar } from './layout/Sidebar';
import { Header } from './layout/Header';
import { MessageList } from './MessageList';
import { CommandPalette } from './CommandPalette';
import { SpawnModal, type SpawnConfig } from './SpawnModal';
import { SettingsPanel, defaultSettings, type Settings } from './SettingsPanel';
import { MentionAutocomplete, getMentionQuery, completeMentionInValue } from './MentionAutocomplete';
import { useWebSocket } from './hooks/useWebSocket';
import { useAgents } from './hooks/useAgents';
import { useMessages } from './hooks/useMessages';
import { api } from '../lib/api';

export interface AppProps {
  /** Initial WebSocket URL (optional, defaults to current host) */
  wsUrl?: string;
}

export function App({ wsUrl }: AppProps) {
  // WebSocket connection for real-time data
  const { data, isConnected, error: wsError } = useWebSocket({ url: wsUrl });

  // View mode state
  const [viewMode, setViewMode] = useState<'local' | 'fleet'>('local');

  // Project state for unified navigation
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<string | undefined>();

  // Spawn modal state
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false);
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Settings panel state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Mobile sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar when selecting an agent or project on mobile
  const closeSidebarOnMobile = useCallback(() => {
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Agent state management
  const {
    agents,
    groups,
    selectedAgent,
    selectAgent,
    searchQuery,
    setSearchQuery,
    totalCount,
    onlineCount,
    needsAttentionCount,
  } = useAgents({
    agents: data?.agents ?? [],
  });

  // Message state management
  const {
    messages,
    currentChannel,
    setCurrentChannel,
    currentThread,
    setCurrentThread,
    sendMessage,
    isSending,
    sendError,
  } = useMessages({
    messages: data?.messages ?? [],
  });

  // Check if fleet view is available
  const isFleetAvailable = Boolean(data?.fleet?.servers?.length);

  // Fetch bridge/project data when fleet is available
  useEffect(() => {
    if (!isFleetAvailable) return;

    const fetchProjects = async () => {
      const result = await api.getBridgeData();
      if (result.success && result.data) {
        const { servers, agents } = result.data;
        const projectList: Project[] = servers.map((server) => ({
          id: server.id,
          path: server.url,
          name: server.name || server.url.split('/').pop(),
          agents: agents.filter((a) => a.server === server.id),
          lead: undefined,
        }));
        setProjects(projectList);
      }
    };

    fetchProjects();
    const interval = setInterval(fetchProjects, 30000);
    return () => clearInterval(interval);
  }, [isFleetAvailable]);

  // Handle project selection
  const handleProjectSelect = useCallback((project: Project) => {
    setCurrentProject(project.id);
    if (project.agents.length > 0) {
      selectAgent(project.agents[0].name);
      setCurrentChannel(project.agents[0].name);
    }
    closeSidebarOnMobile();
  }, [selectAgent, setCurrentChannel, closeSidebarOnMobile]);

  // Handle agent selection
  const handleAgentSelect = useCallback((agent: Agent) => {
    selectAgent(agent.name);
    setCurrentChannel(agent.name);
    closeSidebarOnMobile();
  }, [selectAgent, setCurrentChannel, closeSidebarOnMobile]);

  // Handle spawn button click
  const handleSpawnClick = useCallback(() => {
    setSpawnError(null);
    setIsSpawnModalOpen(true);
  }, []);

  // Handle settings click
  const handleSettingsClick = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  // Handle spawn agent
  const handleSpawn = useCallback(async (config: SpawnConfig): Promise<boolean> => {
    setIsSpawning(true);
    setSpawnError(null);
    try {
      const result = await api.spawnAgent({ name: config.name, cli: config.command, team: config.team });
      if (!result.success) {
        setSpawnError(result.error || 'Failed to spawn agent');
        return false;
      }
      return true;
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : 'Failed to spawn agent');
      return false;
    } finally {
      setIsSpawning(false);
    }
  }, []);

  // Handle release/kill agent
  const handleReleaseAgent = useCallback(async (agent: Agent) => {
    if (!agent.isSpawned) return;

    const confirmed = window.confirm(`Are you sure you want to release agent "${agent.name}"?`);
    if (!confirmed) return;

    try {
      const result = await api.releaseAgent(agent.name);
      if (!result.success) {
        console.error('Failed to release agent:', result.error);
      }
    } catch (err) {
      console.error('Failed to release agent:', err);
    }
  }, []);

  // Handle command palette
  const handleCommandPaletteOpen = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  // Apply theme to document
  React.useEffect(() => {
    const applyTheme = (theme: 'light' | 'dark' | 'system') => {
      let effectiveTheme: 'light' | 'dark';

      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        effectiveTheme = prefersDark ? 'dark' : 'light';
      } else {
        effectiveTheme = theme;
      }

      document.documentElement.setAttribute('data-theme', effectiveTheme);
    };

    applyTheme(settings.theme);

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.theme]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSpawnClick();
      }

      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsSpawnModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSpawnClick]);

  return (
    <div className="flex h-screen bg-bg-primary">
      {/* Mobile Sidebar Overlay */}
      <div
        className={`
          fixed inset-0 bg-black/50 z-[999] transition-opacity duration-200
          md:hidden
          ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar */}
      <Sidebar
        agents={agents}
        projects={projects}
        currentProject={currentProject}
        selectedAgent={selectedAgent?.name}
        viewMode={viewMode}
        isFleetAvailable={isFleetAvailable}
        isConnected={isConnected}
        isOpen={isSidebarOpen}
        onAgentSelect={handleAgentSelect}
        onProjectSelect={handleProjectSelect}
        onViewModeChange={setViewMode}
        onSpawnClick={handleSpawnClick}
        onReleaseClick={handleReleaseAgent}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-secondary">
        {/* Header */}
        <Header
          currentChannel={currentChannel}
          selectedAgent={selectedAgent}
          onCommandPaletteOpen={handleCommandPaletteOpen}
          onSettingsClick={handleSettingsClick}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {wsError ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted text-center">
              <ErrorIcon />
              <h2 className="m-0 mb-2 text-text-primary">Connection Error</h2>
              <p className="text-text-muted">{wsError.message}</p>
              <button
                className="mt-4 py-2 px-4 bg-accent text-white border-none rounded cursor-pointer transition-colors duration-200 hover:bg-accent-hover"
                onClick={() => window.location.reload()}
              >
                Retry Connection
              </button>
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted text-center">
              <LoadingSpinner />
              <p>Connecting to dashboard...</p>
            </div>
          ) : (
            <div className="h-full">
              <MessageList
                messages={messages}
                currentChannel={currentChannel}
                onThreadClick={(messageId) => setCurrentThread(messageId)}
                highlightedMessageId={currentThread ?? undefined}
              />
            </div>
          )}
        </div>

        {/* Message Composer */}
        <div className="p-4 bg-bg-secondary border-t border-border-light">
          <MessageComposer
            recipient={currentChannel === 'general' ? '*' : currentChannel}
            agents={agents}
            onSend={sendMessage}
            isSending={isSending}
            error={sendError}
          />
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        agents={agents}
        projects={projects}
        currentProject={currentProject}
        onAgentSelect={handleAgentSelect}
        onProjectSelect={handleProjectSelect}
        onSpawnClick={handleSpawnClick}
        onGeneralClick={() => {
          selectAgent(null);
          setCurrentChannel('general');
        }}
      />

      {/* Spawn Modal */}
      <SpawnModal
        isOpen={isSpawnModalOpen}
        onClose={() => setIsSpawnModalOpen(false)}
        onSpawn={handleSpawn}
        existingAgents={agents.map((a) => a.name)}
        isSpawning={isSpawning}
        error={spawnError}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onResetSettings={() => setSettings(defaultSettings)}
      />
    </div>
  );
}

/**
 * Message Composer Component with @-mention autocomplete
 */
interface MessageComposerProps {
  recipient: string;
  agents: Agent[];
  onSend: (to: string, content: string) => Promise<boolean>;
  isSending: boolean;
  error: string | null;
}

function MessageComposer({ recipient, agents, onSend, isSending, error }: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessage(value);
    setCursorPosition(cursorPos);

    const query = getMentionQuery(value, cursorPos);
    setShowMentions(query !== null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !isSending) {
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
  };

  const handleMentionSelect = (mention: string, newValue: string) => {
    setMessage(newValue);
    setShowMentions(false);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = newValue.indexOf(' ') + 1;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    const mentionMatch = message.match(/^@(\S+)\s*([\s\S]*)/);
    let target: string;
    let content: string;

    if (mentionMatch) {
      const mentionedName = mentionMatch[1];
      content = mentionMatch[2] || '';

      if (mentionedName === '*' || mentionedName.toLowerCase() === 'everyone' || mentionedName.toLowerCase() === 'all') {
        target = '*';
      } else {
        target = mentionedName;
      }
    } else {
      target = recipient;
      content = message;
    }

    const success = await onSend(target, content || message);
    if (success) {
      setMessage('');
      setShowMentions(false);
    }
  };

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <div className="flex-1 relative">
        <MentionAutocomplete
          agents={agents}
          inputValue={message}
          cursorPosition={cursorPosition}
          onSelect={handleMentionSelect}
          onClose={() => setShowMentions(false)}
          isVisible={showMentions}
        />
        <textarea
          ref={textareaRef}
          className="w-full py-2.5 px-3.5 bg-bg-secondary border border-border rounded-md text-sm font-sans text-text-primary outline-none transition-colors duration-200 resize-none min-h-[40px] max-h-[120px] overflow-y-auto focus:border-accent placeholder:text-text-muted"
          placeholder={`Message ${recipient === '*' ? 'everyone' : '@' + recipient}... (Shift+Enter for new line)`}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart || 0)}
          disabled={isSending}
          rows={1}
        />
      </div>
      <button
        type="submit"
        className="py-2.5 px-5 bg-accent text-white border-none rounded-md text-sm cursor-pointer transition-colors duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!message.trim() || isSending}
        title={isSending ? 'Sending...' : 'Send message'}
      >
        {isSending ? (
          <span>Sending...</span>
        ) : (
          <span className="flex items-center gap-1.5">
            Send
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </span>
        )}
      </button>
      {error && <span className="text-error text-xs ml-2">{error}</span>}
    </form>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin mb-4 text-success" width="24" height="24" viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeDasharray="32"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="text-error mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
