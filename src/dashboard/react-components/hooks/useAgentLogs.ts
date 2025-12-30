/**
 * useAgentLogs Hook
 *
 * React hook for streaming live PTY output from agents via WebSocket.
 * Connects to the agent log streaming endpoint and provides real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface LogLine {
  id: string;
  timestamp: number;
  content: string;
  type: 'stdout' | 'stderr' | 'system' | 'input';
  agentName?: string;
}

export interface UseAgentLogsOptions {
  agentName: string;
  /** Maximum number of lines to keep in buffer */
  maxLines?: number;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Enable reconnection on disconnect */
  reconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

export interface UseAgentLogsReturn {
  logs: LogLine[];
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  clear: () => void;
}

/**
 * Get WebSocket URL for agent log streaming
 */
function getLogStreamUrl(agentName: string): string {
  if (typeof window === 'undefined') {
    return `ws://localhost:3888/ws/logs/${encodeURIComponent(agentName)}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/logs/${encodeURIComponent(agentName)}`;
}

/**
 * Generate a unique ID for log lines
 */
let logIdCounter = 0;
function generateLogId(): string {
  return `log-${Date.now()}-${++logIdCounter}`;
}

export function useAgentLogs(options: UseAgentLogsOptions): UseAgentLogsReturn {
  const {
    agentName,
    maxLines = 5000,
    autoConnect = true,
    reconnect = true,
    maxReconnectAttempts = 5,
  } = options;

  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const agentNameRef = useRef(agentName);

  // Keep agent name ref updated
  agentNameRef.current = agentName;

  const connect = useCallback(() => {
    // Prevent multiple connections
    if (wsRef.current?.readyState === WebSocket.OPEN || isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    const url = getLogStreamUrl(agentNameRef.current);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Add system message for connection
        setLogs((prev) => [
          ...prev,
          {
            id: generateLogId(),
            timestamp: Date.now(),
            content: `Connected to ${agentNameRef.current} log stream`,
            type: 'system',
            agentName: agentNameRef.current,
          },
        ]);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // Add system message for disconnection
        if (!event.wasClean) {
          setLogs((prev) => [
            ...prev,
            {
              id: generateLogId(),
              timestamp: Date.now(),
              content: `Disconnected from log stream (code: ${event.code})`,
              type: 'system',
              agentName: agentNameRef.current,
            },
          ]);
        }

        // Schedule reconnect if enabled
        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptsRef.current),
            30000
          );
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        setError(new Error('WebSocket connection error'));
        setIsConnecting(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle different message formats
          if (typeof data === 'string') {
            // Simple string message
            setLogs((prev) => {
              const newLogs = [
                ...prev,
                {
                  id: generateLogId(),
                  timestamp: Date.now(),
                  content: data,
                  type: 'stdout' as const,
                  agentName: agentNameRef.current,
                },
              ];
              return newLogs.slice(-maxLines);
            });
          } else if (data.type === 'log' || data.type === 'output') {
            // Structured log message
            setLogs((prev) => {
              const logType: LogLine['type'] = data.stream === 'stderr' ? 'stderr' : 'stdout';
              const newLogs: LogLine[] = [
                ...prev,
                {
                  id: generateLogId(),
                  timestamp: data.timestamp || Date.now(),
                  content: data.content || data.data || data.message || '',
                  type: logType,
                  agentName: data.agentName || agentNameRef.current,
                },
              ];
              return newLogs.slice(-maxLines);
            });
          } else if (data.lines && Array.isArray(data.lines)) {
            // Batch of lines
            setLogs((prev) => {
              const newLines: LogLine[] = data.lines.map((line: string | { content: string; type?: string }) => {
                const lineType: LogLine['type'] = (typeof line === 'object' && line.type === 'stderr') ? 'stderr' : 'stdout';
                return {
                  id: generateLogId(),
                  timestamp: Date.now(),
                  content: typeof line === 'string' ? line : line.content,
                  type: lineType,
                  agentName: agentNameRef.current,
                };
              });
              return [...prev, ...newLines].slice(-maxLines);
            });
          }
        } catch {
          // Handle plain text messages
          if (typeof event.data === 'string') {
            setLogs((prev) => {
              const newLogs = [
                ...prev,
                {
                  id: generateLogId(),
                  timestamp: Date.now(),
                  content: event.data,
                  type: 'stdout' as const,
                  agentName: agentNameRef.current,
                },
              ];
              return newLogs.slice(-maxLines);
            });
          }
        }
      };
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to create WebSocket'));
      setIsConnecting(false);
    }
  }, [isConnecting, maxLines, reconnect, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  // Auto-connect on mount or agent change
  useEffect(() => {
    if (autoConnect && agentName) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [agentName, autoConnect, connect, disconnect]);

  return {
    logs,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    clear,
  };
}
