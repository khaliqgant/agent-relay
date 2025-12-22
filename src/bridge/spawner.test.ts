/**
 * Unit tests for AgentSpawner
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentSpawner } from './spawner.js';
import { execAsync, sleep, escapeForTmux } from './utils.js';

vi.mock('./utils.js', () => {
  const execAsync = vi.fn();
  const sleep = vi.fn();
  const escapeForTmux = vi.fn((str: string) => `escaped:${str}`);
  return {
    execAsync,
    sleep,
    escapeForTmux,
  };
});

const execAsyncMock = vi.mocked(execAsync);
const sleepMock = vi.mocked(sleep);
const escapeForTmuxMock = vi.mocked(escapeForTmux);

describe('AgentSpawner', () => {
  const projectRoot = '/project/root';
  const session = 'relay-workers';

  beforeEach(() => {
    vi.clearAllMocks();
    execAsyncMock.mockReset();
    sleepMock.mockReset();
    escapeForTmuxMock.mockReset();
    escapeForTmuxMock.mockImplementation((str: string) => `escaped:${str}`);
  });

  it('creates tmux session when missing', async () => {
    execAsyncMock.mockRejectedValueOnce(new Error('missing'));
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });

    const spawner = new AgentSpawner(projectRoot, session);
    await spawner.ensureSession();

    expect(execAsyncMock).toHaveBeenCalledTimes(2);
    expect(execAsyncMock.mock.calls[0][0]).toBe(`tmux has-session -t ${session} 2>/dev/null`);
    expect(execAsyncMock.mock.calls[1][0]).toBe(`tmux new-session -d -s ${session} -c "${projectRoot}"`);
  });

  it('does nothing when tmux session already exists', async () => {
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });

    const spawner = new AgentSpawner(projectRoot, session);
    await spawner.ensureSession();

    expect(execAsyncMock).toHaveBeenCalledTimes(1);
    expect(execAsyncMock).toHaveBeenCalledWith(`tmux has-session -t ${session} 2>/dev/null`);
  });

  it('spawns a worker and tracks it', async () => {
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });
    sleepMock.mockResolvedValue();

    const spawner = new AgentSpawner(projectRoot, session);
    const result = await spawner.spawn({
      name: 'Dev1',
      cli: 'claude',
      task: 'Finish the report',
      requestedBy: 'Lead',
    });

    expect(result).toMatchObject({
      success: true,
      name: 'Dev1',
      window: `${session}:Dev1`,
    });
    expect(spawner.hasWorker('Dev1')).toBe(true);
    expect(execAsyncMock).toHaveBeenNthCalledWith(1, `tmux has-session -t ${session} 2>/dev/null`);
    expect(execAsyncMock).toHaveBeenNthCalledWith(2, `tmux new-window -t ${session} -n Dev1 -c "${projectRoot}"`);
    expect(execAsyncMock).toHaveBeenNthCalledWith(3, `tmux send-keys -t ${session}:Dev1 'agent-relay -n Dev1 claude' Enter`);
    expect(execAsyncMock).toHaveBeenNthCalledWith(4, `tmux send-keys -t ${session}:Dev1 -l "escaped:Finish the report"`);
    expect(execAsyncMock).toHaveBeenNthCalledWith(5, `tmux send-keys -t ${session}:Dev1 Enter`);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 3000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 100);
  });

  it('refuses to spawn a duplicate worker', async () => {
    const spawner = new AgentSpawner(projectRoot, session);
    spawner['activeWorkers'].set('Dev1', {
      name: 'Dev1',
      cli: 'claude',
      task: 'Existing task',
      spawnedBy: 'Lead',
      spawnedAt: Date.now(),
      window: `${session}:Dev1`,
    });

    const result = await spawner.spawn({
      name: 'Dev1',
      cli: 'claude',
      task: 'New task',
      requestedBy: 'Lead',
    });

    expect(result.success).toBe(false);
    expect(execAsyncMock).not.toHaveBeenCalled();
  });

  it('returns failure when spawn command errors', async () => {
    execAsyncMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // has-session
    execAsyncMock.mockRejectedValueOnce(new Error('tmux new-window failed'));

    const spawner = new AgentSpawner(projectRoot, session);
    const result = await spawner.spawn({
      name: 'Dev2',
      cli: 'claude',
      task: 'Task',
      requestedBy: 'Lead',
    });

    expect(result.success).toBe(false);
    expect(spawner.hasWorker('Dev2')).toBe(false);
  });

  it('releases a worker and removes tracking', async () => {
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });
    sleepMock.mockResolvedValue();

    const spawner = new AgentSpawner(projectRoot, session);
    spawner['activeWorkers'].set('Worker', {
      name: 'Worker',
      cli: 'claude',
      task: 'Task',
      spawnedBy: 'Lead',
      spawnedAt: Date.now(),
      window: `${session}:Worker`,
    });

    const result = await spawner.release('Worker');

    expect(result).toBe(true);
    expect(spawner.hasWorker('Worker')).toBe(false);
    expect(execAsyncMock).toHaveBeenNthCalledWith(1, `tmux send-keys -t ${session}:Worker '/exit' Enter`);
    expect(execAsyncMock).toHaveBeenNthCalledWith(2, `tmux kill-window -t ${session}:Worker`);
    expect(sleepMock).toHaveBeenCalledWith(2000);
  });

  it('returns false when releasing a missing worker', async () => {
    const spawner = new AgentSpawner(projectRoot, session);

    const result = await spawner.release('Missing');

    expect(result).toBe(false);
    expect(execAsyncMock).not.toHaveBeenCalled();
  });

  it('clears worker even when release fails', async () => {
    execAsyncMock.mockRejectedValue(new Error('tmux error'));
    sleepMock.mockResolvedValue();

    const spawner = new AgentSpawner(projectRoot, session);
    spawner['activeWorkers'].set('Failing', {
      name: 'Failing',
      cli: 'claude',
      task: 'Task',
      spawnedBy: 'Lead',
      spawnedAt: Date.now(),
      window: `${session}:Failing`,
    });

    const result = await spawner.release('Failing');

    expect(result).toBe(true);
    expect(spawner.hasWorker('Failing')).toBe(false);
    expect(execAsyncMock).toHaveBeenCalledTimes(2);
    expect(execAsyncMock.mock.calls[0][0]).toBe(`tmux send-keys -t ${session}:Failing '/exit' Enter`);
    expect(execAsyncMock.mock.calls[1][0]).toBe(`tmux kill-window -t ${session}:Failing`);
    expect(sleepMock).toHaveBeenCalledWith(2000);
  });

  it('releases all workers', async () => {
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });
    sleepMock.mockResolvedValue();

    const spawner = new AgentSpawner(projectRoot, session);
    spawner['activeWorkers'].set('A', {
      name: 'A',
      cli: 'claude',
      task: 'Task A',
      spawnedBy: 'Lead',
      spawnedAt: Date.now(),
      window: `${session}:A`,
    });
    spawner['activeWorkers'].set('B', {
      name: 'B',
      cli: 'claude',
      task: 'Task B',
      spawnedBy: 'Lead',
      spawnedAt: Date.now(),
      window: `${session}:B`,
    });

    await spawner.releaseAll();

    expect(spawner.getActiveWorkers()).toHaveLength(0);
    expect(execAsyncMock).toHaveBeenCalledTimes(4); // two send-keys and two kill-window
  });
});
