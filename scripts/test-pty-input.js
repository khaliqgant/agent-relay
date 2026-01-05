#!/usr/bin/env node
/**
 * Test PTY input methods for Claude CLI
 * Run inside workspace container: node /app/dist/scripts/test-pty-input.js
 */

import * as pty from 'node-pty';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

async function main() {
  console.log('Starting Claude CLI via PTY...\n');

  const proc = pty.spawn('claude', [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: '/workspace',
    env: {
      ...process.env,
      NO_COLOR: '1',
      TERM: 'xterm-256color',
      DISPLAY: '',
    },
  });

  let output = '';
  let authUrl = null;
  const prompts = [
    { pattern: /dark\s*(mode|theme)/i, response: '\r', name: 'dark mode' },
    { pattern: /select\s*login|how\s*would\s*you\s*like|subscription\s*or.*api/i, response: '\r', name: 'login method' },
  ];
  const respondedPrompts = new Set();

  proc.onData((data) => {
    output += data;
    const clean = stripAnsi(data);

    // Log output
    if (clean.trim()) {
      console.log('[PTY]', clean.substring(0, 200));
    }

    // Auto-respond to prompts
    for (const prompt of prompts) {
      if (!respondedPrompts.has(prompt.name) && prompt.pattern.test(clean)) {
        respondedPrompts.add(prompt.name);
        console.log(`\n[AUTO] Responding to: ${prompt.name}`);
        setTimeout(() => proc.write(prompt.response), 100);
      }
    }

    // Capture auth URL
    const urlMatch = clean.match(/(https:\/\/[^\s]+)/);
    if (urlMatch && !authUrl) {
      authUrl = urlMatch[1];
      console.log('\n[CAPTURED] Auth URL:', authUrl.substring(0, 80) + '...');
      promptForCode();
    }
  });

  proc.onExit(({ exitCode }) => {
    console.log('\n[EXIT] Claude exited with code:', exitCode);
    console.log('[OUTPUT LENGTH]', output.length);
    rl.close();
    process.exit(exitCode);
  });

  async function promptForCode() {
    console.log('\n========================================');
    console.log('Complete OAuth in browser, then paste the code here.');
    console.log('========================================\n');

    const code = await ask('Paste auth code: ');

    console.log('\nSelect input method:');
    console.log('1. Plain code + \\r');
    console.log('2. Plain code + \\n');
    console.log('3. Bracketed paste + \\r');
    console.log('4. Bracketed paste + \\n');
    console.log('5. Character by character + \\r');

    const method = await ask('Choice (1-5): ');

    const PASTE_START = '\x1b[200~';
    const PASTE_END = '\x1b[201~';
    const cleanCode = code.trim();

    console.log(`\n[SENDING] Using method ${method}...`);

    switch (method) {
      case '1':
        proc.write(cleanCode + '\r');
        break;
      case '2':
        proc.write(cleanCode + '\n');
        break;
      case '3':
        proc.write(PASTE_START + cleanCode + PASTE_END);
        await new Promise(r => setTimeout(r, 200));
        proc.write('\r');
        break;
      case '4':
        proc.write(PASTE_START + cleanCode + PASTE_END);
        await new Promise(r => setTimeout(r, 200));
        proc.write('\n');
        break;
      case '5':
        for (const char of cleanCode) {
          proc.write(char);
          await new Promise(r => setTimeout(r, 10));
        }
        await new Promise(r => setTimeout(r, 200));
        proc.write('\r');
        break;
      default:
        proc.write(cleanCode + '\r');
    }

    console.log('[SENT] Waiting for response...\n');

    // Wait and watch output
    setTimeout(() => {
      console.log('\n[CHECK] Checking for credentials file...');
      import('fs').then(fs => {
        const credPath = '/home/workspace/.claude/.credentials.json';
        if (fs.existsSync(credPath)) {
          console.log('[SUCCESS] Credentials file found!');
          console.log(fs.readFileSync(credPath, 'utf8').substring(0, 200));
        } else {
          console.log('[FAIL] No credentials file yet');
        }
      });
    }, 5000);
  }
}

main().catch(console.error);
