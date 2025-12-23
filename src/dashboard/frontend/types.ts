/**
 * Dashboard Frontend Types
 */

export interface Agent {
  name: string;
  role: string;
  cli: string;
  messageCount: number;
  status?: string;
  lastActive?: string;
  lastSeen?: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  thread?: string;
}

export interface DashboardData {
  agents: Agent[];
  messages: Message[];
  activity: Message[];
  sessions: SessionInfo[];
  summaries: AgentSummary[];
}

export interface SessionInfo {
  id: string;
  agentName: string;
  cli?: string;
  startedAt: string;
  endedAt?: string;
  duration?: string;
  messageCount: number;
  summary?: string;
  isActive: boolean;
  closedBy?: 'agent' | 'disconnect' | 'error';
}

export interface AgentSummary {
  agentName: string;
  lastUpdated: string;
  currentTask?: string;
  completedTasks?: string[];
  context?: string;
}

export type ChannelType = 'general' | 'broadcasts' | string;

export interface AppState {
  agents: Agent[];
  messages: Message[];
  currentChannel: ChannelType;
  isConnected: boolean;
  ws: WebSocket | null;
  reconnectAttempts: number;
}

export interface DOMElements {
  connectionDot: HTMLElement;
  channelsList: HTMLElement;
  agentsList: HTMLElement;
  messagesList: HTMLElement;
  currentChannelName: HTMLElement;
  channelTopic: HTMLElement;
  onlineCount: HTMLElement;
  targetSelect: HTMLSelectElement;
  messageInput: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  searchTrigger: HTMLElement;
  commandPaletteOverlay: HTMLElement;
  paletteSearch: HTMLInputElement;
  paletteResults: HTMLElement;
  paletteAgentsSection: HTMLElement;
  paletteMessagesSection: HTMLElement;
  typingIndicator: HTMLElement;
}
