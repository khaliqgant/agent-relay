/**
 * Bridge State Management
 * Centralized state for the bridge dashboard
 */

import type { BridgeState, Project, BridgeMessage } from './types.js';

type StateListener = () => void;

// Bridge state
export const state: BridgeState = {
  projects: [],
  messages: [],
  selectedProjectId: null,
  isConnected: false,
  ws: null,
  connectionStart: null,
};

// State subscribers
const listeners: StateListener[] = [];

/**
 * Subscribe to state changes
 */
export function subscribe(listener: StateListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[bridge-state] Listener error:', err);
    }
  });
}

/**
 * Update projects
 */
export function setProjects(projects: Project[]): void {
  state.projects = projects;
  notifyListeners();
}

/**
 * Update messages
 */
export function setMessages(messages: BridgeMessage[]): void {
  state.messages = messages;
  notifyListeners();
}

/**
 * Set selected project
 */
export function setSelectedProject(projectId: string | null): void {
  state.selectedProjectId = projectId;
  notifyListeners();
}

/**
 * Update connection status
 */
export function setConnected(connected: boolean): void {
  state.isConnected = connected;
  if (connected && !state.connectionStart) {
    state.connectionStart = Date.now();
  }
  notifyListeners();
}

/**
 * Set WebSocket instance
 */
export function setWebSocket(ws: WebSocket | null): void {
  state.ws = ws;
}

/**
 * Get all agents across all projects
 */
export function getAllAgents(): { name: string; projectId: string; projectName: string; cli?: string }[] {
  const agents: { name: string; projectId: string; projectName: string; cli?: string }[] = [];

  state.projects.forEach((project) => {
    (project.agents || []).forEach((agent) => {
      agents.push({
        name: agent.name,
        projectId: project.id,
        projectName: project.name || project.id,
        cli: agent.cli,
      });
    });
  });

  return agents;
}

/**
 * Get connected projects
 */
export function getConnectedProjects(): Project[] {
  return state.projects.filter((p) => p.connected);
}

/**
 * Get project by ID
 */
export function getProject(projectId: string): Project | undefined {
  return state.projects.find((p) => p.id === projectId);
}

/**
 * Get uptime formatted string
 */
export function getUptimeString(): string {
  if (!state.connectionStart) return '--';

  const ms = Date.now() - state.connectionStart;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
