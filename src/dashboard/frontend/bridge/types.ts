/**
 * Bridge Frontend Types
 * Extends shared types from the main dashboard
 */

import type { Agent, Message } from '../types.js';

export interface Project {
  id: string;
  name?: string;
  path: string;
  connected: boolean;
  reconnecting?: boolean;
  lead?: LeadInfo;
  agents?: ProjectAgent[];
}

export interface LeadInfo {
  name: string;
  connected: boolean;
}

export interface ProjectAgent extends Agent {
  projectId: string;
  projectName: string;
}

export interface BridgeMessage extends Message {
  sourceProject?: string;
  targetProject?: string;
  body?: string;  // Alternative to content for bridge messages
}

export interface BridgeData {
  projects: Project[];
  messages: BridgeMessage[];
  connected: boolean;
}

export interface BridgeState {
  projects: Project[];
  messages: BridgeMessage[];
  selectedProjectId: string | null;
  isConnected: boolean;
  ws: WebSocket | null;
  connectionStart: number | null;
}

export interface BridgeDOMElements {
  statusDot: HTMLElement;
  projectList: HTMLElement;
  cardsGrid: HTMLElement;
  emptyState: HTMLElement;
  messagesList: HTMLElement;
  searchBar: HTMLElement;
  paletteOverlay: HTMLElement;
  paletteSearch: HTMLInputElement;
  paletteResults: HTMLElement;
  paletteProjectsSection: HTMLElement;
  paletteAgentsSection: HTMLElement;
  channelName: HTMLElement;
  statAgents: HTMLElement;
  statMessages: HTMLElement;
  composerProject: HTMLSelectElement;
  composerAgent: HTMLSelectElement;
  composerMessage: HTMLInputElement;
  composerSend: HTMLButtonElement;
  composerStatus: HTMLElement;
  uptime: HTMLElement;
}
