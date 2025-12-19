import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { setupTicTacToe } from './tictactoe.js';

function makeTempDir(): string {
  const base = path.join(process.cwd(), '.tmp-games-tests');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'tictactoe-'));
  return dir;
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('TicTacToe Setup', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      cleanup(tempDir);
    }
  });

  it('creates player directories with default names', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({ dataDir: tempDir });

    expect(result.playerX).toBe('PlayerX');
    expect(result.playerO).toBe('PlayerO');
    expect(fs.existsSync(path.join(tempDir, 'PlayerX'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'PlayerO'))).toBe(true);
  });

  it('creates player directories with custom names', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({
      dataDir: tempDir,
      playerX: 'Alice',
      playerO: 'Bob',
    });

    expect(result.playerX).toBe('Alice');
    expect(result.playerO).toBe('Bob');
    expect(fs.existsSync(path.join(tempDir, 'Alice'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'Bob'))).toBe(true);
  });

  it('creates empty inbox files for both players', () => {
    tempDir = makeTempDir();
    setupTicTacToe({ dataDir: tempDir });

    const inboxX = path.join(tempDir, 'PlayerX', 'inbox.md');
    const inboxO = path.join(tempDir, 'PlayerO', 'inbox.md');

    expect(fs.existsSync(inboxX)).toBe(true);
    expect(fs.existsSync(inboxO)).toBe(true);
    expect(fs.readFileSync(inboxX, 'utf-8')).toBe('');
    expect(fs.readFileSync(inboxO, 'utf-8')).toBe('');
  });

  it('creates instruction files for both players', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({ dataDir: tempDir });

    expect(fs.existsSync(result.instructionsXPath)).toBe(true);
    expect(fs.existsSync(result.instructionsOPath)).toBe(true);
  });

  it('generates correct instructions for Player X', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({
      dataDir: tempDir,
      playerX: 'AgentX',
      playerO: 'AgentO',
    });

    const instructions = fs.readFileSync(result.instructionsXPath, 'utf-8');

    expect(instructions).toContain('You are **AgentX** (X)');
    expect(instructions).toContain('You play FIRST');
    expect(instructions).toContain('AgentO');
    expect(instructions).toContain('inbox-poll -n AgentX');
    expect(instructions).toContain('inbox-write -t AgentO -f AgentX');
    expect(instructions).toContain(tempDir);
  });

  it('generates correct instructions for Player O', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({
      dataDir: tempDir,
      playerX: 'AgentX',
      playerO: 'AgentO',
    });

    const instructions = fs.readFileSync(result.instructionsOPath, 'utf-8');

    expect(instructions).toContain('You are **AgentO** (O)');
    expect(instructions).toContain('AgentX plays first');
    expect(instructions).toContain('WAIT for their move');
    expect(instructions).toContain('inbox-poll -n AgentO');
    expect(instructions).toContain('inbox-write -t AgentX -f AgentO');
    expect(instructions).toContain(tempDir);
  });

  it('includes board position diagram in instructions', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({ dataDir: tempDir });

    const instructionsX = fs.readFileSync(result.instructionsXPath, 'utf-8');
    const instructionsO = fs.readFileSync(result.instructionsOPath, 'utf-8');

    // Both should have the board diagram
    expect(instructionsX).toContain('1 | 2 | 3');
    expect(instructionsX).toContain('4 | 5 | 6');
    expect(instructionsX).toContain('7 | 8 | 9');

    expect(instructionsO).toContain('1 | 2 | 3');
    expect(instructionsO).toContain('4 | 5 | 6');
    expect(instructionsO).toContain('7 | 8 | 9');
  });

  it('returns correct setup result structure', () => {
    tempDir = makeTempDir();
    const result = setupTicTacToe({
      dataDir: tempDir,
      playerX: 'TestX',
      playerO: 'TestO',
    });

    expect(result).toEqual({
      dataDir: tempDir,
      playerX: 'TestX',
      playerO: 'TestO',
      instructionsXPath: path.join(tempDir, 'TestX', 'GAME_INSTRUCTIONS.md'),
      instructionsOPath: path.join(tempDir, 'TestO', 'GAME_INSTRUCTIONS.md'),
    });
  });
});
