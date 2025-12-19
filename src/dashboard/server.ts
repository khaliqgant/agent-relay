import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SqliteStorageAdapter } from '../storage/sqlite-adapter.js';
import type { StorageAdapter, StoredMessage } from '../storage/adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AgentStatus {
  name: string;
  role: string;
  cli: string;
  messageCount: number;
  status?: string;
  lastActive?: string;
}

interface Message {
  from: string;
  to: string;
  content: string;
  timestamp: string;
  id: string; // unique-ish id
}

export async function startDashboard(port: number, dataDir: string, dbPath?: string): Promise<void> {
  console.log('Starting dashboard...');
  console.log('__dirname:', __dirname);
  const publicDir = path.join(__dirname, 'public');
  console.log('Public dir:', publicDir);
  const storage: StorageAdapter | undefined = dbPath
    ? new SqliteStorageAdapter({ dbPath })
    : undefined;

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  if (storage) {
    await storage.init();
  }

  // Serve static files from public directory
  app.use(express.static(publicDir));
  app.use(express.json());

  const getTeamData = () => {
    // Try team.json first (file-based team mode)
    const teamPath = path.join(dataDir, 'team.json');
    if (fs.existsSync(teamPath)) {
      try {
        return JSON.parse(fs.readFileSync(teamPath, 'utf-8'));
      } catch (e) {
        console.error('Failed to read team.json', e);
      }
    }

    // Fall back to agents.json (daemon mode - live connected agents)
    const agentsPath = path.join(dataDir, 'agents.json');
    if (fs.existsSync(agentsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
        // Convert agents.json format to team.json format
        return {
          agents: data.agents.map((a: { name: string; connectedAt?: string; cli?: string }) => ({
            name: a.name,
            role: 'Agent',
            cli: a.cli ?? 'Unknown',
          })),
        };
      } catch (e) {
        console.error('Failed to read agents.json', e);
      }
    }

    return null;
  };

  const parseInbox = (agentName: string): Message[] => {
    const inboxPath = path.join(dataDir, agentName, 'inbox.md');
    if (!fs.existsSync(inboxPath)) return [];
    
    try {
      const content = fs.readFileSync(inboxPath, 'utf-8');
      const messages: Message[] = [];
      
      // Split by "## Message from "
      const parts = content.split('## Message from ');
      
      parts.forEach((part, index) => {
        if (!part.trim()) return;
        
        const firstLineEnd = part.indexOf('\n');
        if (firstLineEnd === -1) return;
        
        const header = part.substring(0, firstLineEnd).trim(); // "Sender | Timestamp" or just "Sender"
        const body = part.substring(firstLineEnd).trim();
        
        // Handle potential " | " in header
        let sender = header;
        let timestamp = new Date().toISOString();
        
        if (header.includes('|')) {
          const split = header.split('|');
          sender = split[0].trim();
          timestamp = split.slice(1).join('|').trim();
        }

        messages.push({
          from: sender,
          to: agentName,
          content: body,
          timestamp: timestamp,
          id: `${agentName}-${index}-${Date.now()}`
        });
      });
      return messages;
    } catch (e) {
      console.error(`Failed to read inbox for ${agentName}`, e);
      return [];
    }
  };

  const mapStoredMessages = (rows: StoredMessage[]): Message[] => rows
    .map((row) => ({
      from: row.from,
      to: row.to,
      content: row.body,
      timestamp: new Date(row.ts).toISOString(),
      id: row.id,
    }));

  const getMessages = async (agents: any[]): Promise<Message[]> => {
    if (storage) {
      const rows = await storage.getMessages({ limit: 500, order: 'desc' });
      // Dashboard expects oldest first
      return mapStoredMessages(rows).reverse();
    }

    // Fallback to file-based inbox parsing
    let allMessages: Message[] = [];
    agents.forEach((a: any) => {
      const msgs = parseInbox(a.name);
      allMessages = [...allMessages, ...msgs];
    });
    return allMessages;
  };

  const getAllData = async () => {
    const team = getTeamData();
    if (!team) return { agents: [], messages: [], activity: [] };

    const agentsMap = new Map<string, AgentStatus>();
    const allMessages: Message[] = await getMessages(team.agents);

    // Initialize agents from config
    team.agents.forEach((a: any) => {
      agentsMap.set(a.name, {
        name: a.name,
        role: a.role,
        cli: a.cli ?? 'Unknown',
        messageCount: 0,
        status: 'Idle'
      });
    });

    // Update inbox counts if fallback mode; if storage, count messages addressed to agent
    if (storage) {
      for (const msg of allMessages) {
        const agent = agentsMap.get(msg.to);
        if (agent) {
          agent.messageCount = (agent.messageCount ?? 0) + 1;
        }
      }
    } else {
      // Sort by timestamp
      allMessages.sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
    }

    // Derive status from messages sent BY agents
    // We scan all messages; if M is from A, we check if it is a STATUS message
    allMessages.forEach(m => {
      const agent = agentsMap.get(m.from);
      if (agent) {
        agent.lastActive = m.timestamp;
        if (m.content.startsWith('STATUS:')) {
          agent.status = m.content.substring(7).trim(); // remove "STATUS:"
        }
      }
    });

    return {
      agents: Array.from(agentsMap.values()),
      messages: allMessages,
      activity: allMessages // For now, activity log is just the message log
    };
  };

  const broadcastData = async () => {
    const data = await getAllData();
    const payload = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  app.get('/api/data', (req, res) => {
    getAllData().then((data) => res.json(data)).catch((err) => {
      console.error('Failed to fetch dashboard data', err);
      res.status(500).json({ error: 'Failed to load data' });
    });
  });

  // Watch for changes
  if (storage) {
    setInterval(() => {
      broadcastData().catch((err) => console.error('Broadcast failed', err));
    }, 1000);
  } else {
    let fsWait: NodeJS.Timeout | null = null;
    try {
      if (fs.existsSync(dataDir)) {
          console.log(`Watching ${dataDir} for changes...`);
          fs.watch(dataDir, { recursive: true }, (eventType, filename) => {
              if (filename && (filename.endsWith('inbox.md') || filename.endsWith('team.json') || filename.endsWith('agents.json'))) {
                  // Debounce
                  if (fsWait) return;
                  fsWait = setTimeout(() => {
                      fsWait = null;
                      broadcastData();
                  }, 100);
              }
          });
      } else {
          console.warn(`Data directory ${dataDir} does not exist yet.`);
      }
    } catch (e) {
      console.error('Watch failed:', e);
    }
  }

  return new Promise((resolve, reject) => {
      try {
        server.listen(port, () => {
            console.log(`Dashboard running at http://localhost:${port}`);
            console.log(`Monitoring: ${dataDir}`);
            // We do NOT resolve here to keep the process alive
            // But we must resolve if the user sends SIGINT? 
            // The main process handles SIGINT.
        });
        
        server.on('error', (err) => {
            console.error('Server error:', err);
            reject(err);
        });
      } catch (e) {
          reject(e);
      }
  });
}
