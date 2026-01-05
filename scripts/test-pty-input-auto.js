#!/usr/bin/env node
/**
 * Automated PTY input test for Claude CLI
 * Tests different input methods without user interaction
 * Run inside workspace container: node /app/dist/scripts/test-pty-input-auto.js
 */

import * as pty from 'node-pty';

const TEST_CODE = 'test-auth-code-12345';
const INPUT_METHOD = process.argv[2] || '1';

// Debug: Log all escape sequences we send
function logHex(label, data) {
  const hex = Buffer.from(data).toString('hex').replace(/(.{2})/g, '$1 ').trim();
  console.log(`[HEX] ${label}: ${hex}`);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

async function main() {
  console.log(`\nTesting PTY input method ${INPUT_METHOD} with code: ${TEST_CODE}\n`);

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
  let codePromptSeen = false;
  let codeSent = false;
  const prompts = [
    { pattern: /dark\s*(mode|theme)/i, response: '\r', name: 'dark mode' },
    { pattern: /select\s*login|how\s*would\s*you\s*like|subscription\s*or.*api/i, response: '\r', name: 'login method' },
  ];
  const respondedPrompts = new Set();

  proc.onData((data) => {
    output += data;
    const clean = stripAnsi(data);

    // Log meaningful output
    if (clean.trim()) {
      const lines = clean.trim().split('\n').map(l => l.trim()).filter(l => l);
      for (const line of lines) {
        if (line.length > 3 && !line.match(/^[·✢*✶✻✽]+$/)) {
          console.log('[PTY]', line.substring(0, 120));
        }
      }
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
      console.log('\n[CAPTURED] Auth URL detected');
    }

    // Look for code paste prompt - various patterns Claude might use
    const codePromptPatterns = [
      /paste.*code/i,
      /enter.*code/i,
      /authorization.*code/i,
      /code.*here/i,
      /waiting.*code/i,
      /input.*code/i,
    ];

    if (authUrl && !codePromptSeen && !codeSent) {
      for (const pattern of codePromptPatterns) {
        if (pattern.test(clean)) {
          codePromptSeen = true;
          console.log('\n[DETECTED] Code prompt pattern:', pattern.toString());
          break;
        }
      }
    }

    // Also look for the text input box indicator from Ink
    // After URL is shown and some time passes, try sending the code
    if (authUrl && !codeSent) {
      // Check if we see any indication we should enter the code
      const outputLower = stripAnsi(output).toLowerCase();
      const hasCodePrompt = outputLower.includes('paste') ||
                           outputLower.includes('enter the code') ||
                           outputLower.includes('authorization code') ||
                           outputLower.includes("browser didn't open");

      if (hasCodePrompt || output.length > 5000) {
        codeSent = true;
        console.log('\n[SENDING] Sending code after prompt/timeout...');
        setTimeout(() => sendCode(proc), 500);
      }
    }
  });

  proc.onExit(({ exitCode }) => {
    console.log('\n[EXIT] Claude exited with code:', exitCode);
    console.log('[TOTAL OUTPUT LENGTH]', output.length);

    // Check for credentials
    import('fs').then(fs => {
      const credPath = '/home/workspace/.claude/.credentials.json';
      if (fs.existsSync(credPath)) {
        console.log('[SUCCESS] Credentials file found!');
        const creds = fs.readFileSync(credPath, 'utf8');
        console.log('[CREDS]', creds.substring(0, 200));
      } else {
        console.log('[RESULT] No credentials file created (expected with test code)');
      }
    });

    setTimeout(() => process.exit(exitCode), 1000);
  });

  async function sendCode(ptyProc) {
    const PASTE_START = '\x1b[200~';
    const PASTE_END = '\x1b[201~';

    console.log(`[METHOD ${INPUT_METHOD}] Sending test code...`);

    switch (INPUT_METHOD) {
      case '1':
        console.log('[1] Plain code + \\r (carriage return)');
        logHex('sending', TEST_CODE + '\r');
        ptyProc.write(TEST_CODE + '\r');
        break;
      case '2':
        console.log('[2] Plain code + \\n (newline)');
        logHex('sending', TEST_CODE + '\n');
        ptyProc.write(TEST_CODE + '\n');
        break;
      case '3':
        console.log('[3] Bracketed paste + \\r');
        logHex('paste start', PASTE_START);
        logHex('code', TEST_CODE);
        logHex('paste end', PASTE_END);
        ptyProc.write(PASTE_START + TEST_CODE + PASTE_END);
        await new Promise(r => setTimeout(r, 200));
        logHex('enter', '\r');
        ptyProc.write('\r');
        break;
      case '4':
        console.log('[4] Plain code + \\r\\n (CRLF)');
        logHex('sending', TEST_CODE + '\r\n');
        ptyProc.write(TEST_CODE + '\r\n');
        break;
      case '5':
        console.log('[5] Character by character + \\r');
        for (const char of TEST_CODE) {
          ptyProc.write(char);
          await new Promise(r => setTimeout(r, 10));
        }
        await new Promise(r => setTimeout(r, 200));
        logHex('enter', '\r');
        ptyProc.write('\r');
        break;
      case '6':
        console.log('[6] Code then wait, then Enter separately');
        logHex('code only', TEST_CODE);
        ptyProc.write(TEST_CODE);
        await new Promise(r => setTimeout(r, 1000));
        console.log('[6] Now sending Enter...');
        logHex('enter', '\r');
        ptyProc.write('\r');
        break;
      case '7':
        console.log('[7] Send Enter first then code then Enter');
        ptyProc.write('\r'); // Clear any existing state
        await new Promise(r => setTimeout(r, 200));
        logHex('code + enter', TEST_CODE + '\r');
        ptyProc.write(TEST_CODE + '\r');
        break;
      case '8':
        console.log('[8] Ctrl+M (same as \\r but explicit)');
        logHex('code + ctrl-m', TEST_CODE + '\x0d');
        ptyProc.write(TEST_CODE + '\x0d');
        break;
      default:
        console.log('[DEFAULT] Plain code + \\r');
        ptyProc.write(TEST_CODE + '\r');
    }

    console.log('[SENT] Waiting for response...');

    // Give it more time to process and show error
    setTimeout(() => {
      console.log('\n[TIMEOUT] Test complete, terminating...');
      console.log('[FINAL OUTPUT CHECK] Last 500 chars of output:');
      console.log(stripAnsi(output).slice(-500));
      ptyProc.kill();
    }, 20000);
  }

  // Failsafe timeout
  setTimeout(() => {
    console.log('\n[FAILSAFE] Max time reached, terminating...');
    proc.kill();
  }, 60000);
}

main().catch(console.error);
