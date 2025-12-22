/**
 * Unit tests for MultiProjectClient (error paths and state callbacks)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { MultiProjectClient } from './multi-project-client.js';
import type { ProjectConfig } from './types.js';

// Shared mock state (hoisted for vi.mock)
const { existsSyncMock, createConnectionMock, encodeFrameMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  createConnectionMock: vi.fn(),
  encodeFrameMock: vi.fn(),
}));
let framesToReturn: any[] = [];

// Mock fs and net
vi.mock('node:fs', () => ({
  default: {
    existsSync: existsSyncMock,
  },
  existsSync: existsSyncMock,
}));

vi.mock('node:net', () => ({
  default: {
    createConnection: createConnectionMock,
  },
  createConnection: createConnectionMock,
}));

// Mock framing utilities
vi.mock('../protocol/framing.js', () => ({
  FrameParser: class {
    push = vi.fn(() => framesToReturn);
  },
  encodeFrame: encodeFrameMock,
}));

// Simple socket stub
class MockSocket extends EventEmitter {
  write = vi.fn();
  end = vi.fn();
  destroy = vi.fn();
}

const projectA: ProjectConfig = {
  path: '/project/a',
  id: 'project-a',
  socketPath: '/project/a/relay.sock',
  leadName: 'Alice',
  cli: 'claude',
};

describe('MultiProjectClient (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    framesToReturn = [];
    encodeFrameMock.mockImplementation(() => Buffer.from('frame'));
    existsSyncMock.mockReturnValue(true);

    createConnectionMock.mockImplementation((_path: string, cb?: () => void) => {
      const socket = new MockSocket();
      // Simulate immediate connect callback
      cb?.();
      return socket;
    });
  });

  it('rejects connect when socket is missing', async () => {
    existsSyncMock.mockReturnValue(false);

    const client = new MultiProjectClient([projectA]);
    await expect(client.connect()).rejects.toThrow();
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('times out when daemon never becomes ready', async () => {
    vi.useFakeTimers();
    const client = new MultiProjectClient([projectA]);

    const connectPromise = client.connect();

    // No WELCOME frame emitted -> timeout triggers
    await vi.runAllTimersAsync();
    await expect(connectPromise).rejects.toThrow('Connection timeout');
  });

  it('invokes state change callbacks on welcome and close', async () => {
    vi.useFakeTimers();
    const socket = new MockSocket();
    createConnectionMock.mockImplementation((_path: string, cb?: () => void) => {
      cb?.();
      return socket;
    });

    framesToReturn = [
      {
        type: 'WELCOME',
        id: 'welcome-1',
        v: 1,
        ts: Date.now(),
        payload: {},
      },
    ];

    const client = new MultiProjectClient([projectA]);
    const states: Array<{ id: string; connected: boolean }> = [];
    client.onProjectStateChange = (id, connected) => states.push({ id, connected });

    const connectPromise = client.connect();

    // Emit data to produce WELCOME
    socket.emit('data', Buffer.from('welcome'));
    await vi.runOnlyPendingTimersAsync();
    await connectPromise;

    // Simulate close
    socket.emit('close');

    expect(states).toEqual([
      { id: 'project-a', connected: true },
      { id: 'project-a', connected: false },
    ]);
    expect(client.getConnectedProjects()).toContain('project-a');
  });

  it('sendToProject returns false when project missing or not ready', () => {
    const client = new MultiProjectClient([projectA]);

    expect(client.sendToProject('unknown', 'Bob', 'hi')).toBe(false);

    // Manually insert a connection but mark not ready
    (client as any).connections.set('project-a', {
      config: projectA,
      ready: false,
    });
    expect(client.sendToProject('project-a', 'Bob', 'hi')).toBe(false);
  });

  it('sendToProject returns false when frame encoding throws', () => {
    const client = new MultiProjectClient([projectA]);
    const socket = new MockSocket();

    // Insert ready connection
    (client as any).connections.set('project-a', {
      config: projectA,
      socket,
      ready: true,
    });

    encodeFrameMock.mockImplementation(() => {
      throw new Error('encode failed');
    });

    const result = client.sendToProject('project-a', 'Bob', 'hi');
    expect(result).toBe(false);
  });

  it('broadcastToLeads only sends to ready connections and resolves lead alias', () => {
    const client = new MultiProjectClient([projectA]);
    const socket = new MockSocket();

    (client as any).connections.set('project-a', {
      config: projectA,
      socket,
      ready: true,
    });
    client.registerLead('project-a', 'Alice');

    client.broadcastToLeads('Hello leads');

    expect(encodeFrameMock).toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalled();
  });

  it('getConnectedProjects filters by ready state', () => {
    const client = new MultiProjectClient([projectA]);
    (client as any).connections.set('project-a', {
      config: projectA,
      ready: true,
    });
    (client as any).connections.set('project-b', {
      config: { ...projectA, id: 'project-b', socketPath: '/b.sock', path: '/b' },
      ready: false,
    });

    expect(client.getConnectedProjects()).toEqual(['project-a']);
  });
});
