/**
 * WebSocket Connection Handler
 */

import type { DashboardData, FleetData } from './types.js';
import {
  state,
  setAgents,
  setMessages,
  setConnectionStatus,
  setWebSocket,
  incrementReconnectAttempts,
  setFleetData,
} from './state.js';

type DataHandler = (data: DashboardData) => void;

let dataHandler: DataHandler | null = null;

/**
 * Set the handler for incoming data
 */
export function onData(handler: DataHandler): void {
  dataHandler = handler;
}

/**
 * Connect to the WebSocket server
 */
export function connect(): void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = (): void => {
    setConnectionStatus(true);
  };

  ws.onclose = (): void => {
    setConnectionStatus(false);
    // Reconnect with exponential backoff
    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
    incrementReconnectAttempts();
    setTimeout(connect, delay);
  };

  ws.onerror = (error): void => {
    console.error('WebSocket error:', error);
  };

  ws.onmessage = (event: MessageEvent): void => {
    try {
      const data: DashboardData = JSON.parse(event.data as string);
      handleData(data);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  };

  setWebSocket(ws);
}

/**
 * Extended dashboard data with fleet support
 */
interface ExtendedDashboardData extends DashboardData {
  fleet?: FleetData;
}

/**
 * Handle incoming dashboard data
 */
function handleData(data: ExtendedDashboardData): void {
  console.log('[WS] Received data:', { agentCount: data.agents?.length, messageCount: data.messages?.length, hasFleet: !!data.fleet });

  if (data.agents) {
    console.log('[WS] Setting agents:', data.agents.map(a => a.name));
    setAgents(data.agents);
  }

  if (data.messages) {
    setMessages(data.messages);
  }

  // Handle fleet data for multi-server view
  if (data.fleet) {
    console.log('[WS] Setting fleet data:', { servers: data.fleet.servers?.length, agents: data.fleet.agents?.length });
    setFleetData(data.fleet);
  }

  if (dataHandler) {
    dataHandler(data);
  }
}

/**
 * Send a message via the REST API
 */
export async function sendMessage(
  to: string,
  message: string,
  thread?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const body: { to: string; message: string; thread?: string } = { to, message };
    if (thread) {
      body.thread = thread;
    }

    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      return { success: true };
    } else {
      return { success: false, error: result.error || 'Failed to send message' };
    }
  } catch (err) {
    return { success: false, error: 'Network error - could not send message' };
  }
}
