/**
 * PTY Wrapper
 * Wraps an agent CLI command in a pseudo-terminal and intercepts
 * relay commands from output while injecting incoming messages.
 */

import * as pty from 'node-pty';
import { execSync } from 'node:child_process';
import { RelayClient } from './client.js';
import { OutputParser, type ParsedCommand } from './parser.js';
import { InboxManager } from './inbox.js';
import type { SendPayload } from '../protocol/types.js';

export interface WrapperConfig {
  name: string;
  command: string;
  args?: string[];
  socketPath?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  /** Raw mode - bypass all parsing for terminal-heavy CLIs */
  raw?: boolean;
  /** Use tmux for message injection (more reliable) */
  useTmux?: boolean;
  /** Use osascript for OS-level keyboard simulation (macOS only) */
  useOsascript?: boolean;
  /** Use file-based inbox instead of stdin injection */
  useInbox?: boolean;
  /** Custom inbox directory */
  inboxDir?: string;
}

export class PtyWrapper {
  private config: WrapperConfig;
  private ptyProcess?: pty.IPty;
  private client: RelayClient;
  private parser: OutputParser;
  private inbox?: InboxManager;
  private running = false;
  private lastOutputTime = 0;
  private messageQueue: Array<{ from: string; payload: SendPayload }> = [];
  private processingMessage = false;
  private recentlySentMessages: Map<string, number> = new Map(); // hash -> timestamp
  private tmuxSessionName?: string;
  private pendingRelayMessages: Array<{ from: string; body: string }> = [];
  private outputBuffer = '';
  private lastOutputFlush = 0;

  constructor(config: WrapperConfig) {
    this.config = {
      // Use actual terminal size, fallback to defaults
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      ...config,
    };

    this.client = new RelayClient({
      agentName: config.name,
      socketPath: config.socketPath,
    });

    this.parser = new OutputParser();

    // Initialize inbox if using file-based messaging
    if (config.useInbox) {
      this.inbox = new InboxManager({
        agentName: config.name,
        inboxDir: config.inboxDir,
      });
    }

    // Handle incoming messages
    this.client.onMessage = (from: string, payload: SendPayload) => {
      this.handleIncomingMessage(from, payload);
    };

    this.client.onStateChange = (state) => {
      process.stderr.write(`[wrapper:${this.config.name}] Relay state: ${state}\n`);
    };
  }

  /**
   * Start the wrapped agent process.
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Initialize inbox if using file-based messaging
    if (this.inbox) {
      this.inbox.init();
      const inboxPath = this.inbox.getInboxPath();
      process.stderr.write(`[wrapper:${this.config.name}] Inbox mode enabled\n`);
      process.stderr.write(`[wrapper:${this.config.name}] Inbox path: ${inboxPath}\n`);
      process.stderr.write(`[wrapper:${this.config.name}] Tell agent: "After each response, read ${inboxPath} for messages"\n`);
    }

    // Connect to relay daemon
    try {
      await this.client.connect();
    } catch (err) {
      process.stderr.write(`[wrapper:${this.config.name}] Failed to connect to relay: ${err}\n`);
      // Continue without relay - agent can still run standalone
    }

    // Parse command
    const [cmd, ...defaultArgs] = this.config.command.split(' ');
    const args = this.config.args ?? defaultArgs;

    if (this.config.useTmux) {
      await this.startWithTmux(cmd, args);
    } else {
      await this.startDirect(cmd, args);
    }

    process.stderr.write(`[wrapper:${this.config.name}] Started: ${this.config.command}${this.config.useTmux ? ' (tmux mode)' : ''}${this.config.useInbox ? ' (inbox mode)' : ''}\n`);
  }

  /**
   * Start with tmux for message injection.
   */
  private async startWithTmux(cmd: string, args: string[]): Promise<void> {
    // Create a unique tmux session name
    this.tmuxSessionName = `relay-${this.config.name}-${Date.now()}`;
    const fullCommand = [cmd, ...args].join(' ');

    // Kill any existing session with this name
    try {
      execSync(`tmux kill-session -t ${this.tmuxSessionName} 2>/dev/null`, { encoding: 'utf-8' });
    } catch {
      // Session doesn't exist, that's fine
    }

    // Create tmux session running the command
    const tmuxCmd = `tmux new-session -d -s ${this.tmuxSessionName} -x ${this.config.cols} -y ${this.config.rows} '${fullCommand}'`;
    execSync(tmuxCmd, {
      cwd: this.config.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...this.config.env,
        AGENT_RELAY_NAME: this.config.name,
        TERM: 'xterm-256color',
      },
    });

    // Attach to tmux session via PTY (so we can capture output)
    this.ptyProcess = pty.spawn('tmux', ['attach-session', '-t', this.tmuxSessionName], {
      name: 'xterm-256color',
      cols: this.config.cols!,
      rows: this.config.rows!,
      cwd: this.config.cwd ?? process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    this.running = true;
    this.setupPtyHandlers();
  }

  /**
   * Start directly without tmux.
   */
  private async startDirect(cmd: string, args: string[]): Promise<void> {
    this.ptyProcess = pty.spawn(cmd, args, {
      name: 'xterm-256color',
      cols: this.config.cols!,
      rows: this.config.rows!,
      cwd: this.config.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...this.config.env,
        AGENT_RELAY_NAME: this.config.name,
        TERM: 'xterm-256color',
      },
    });

    this.running = true;
    this.setupPtyHandlers();
  }

  /**
   * Set up PTY event handlers.
   */
  private setupPtyHandlers(): void {
    if (!this.ptyProcess) return;

    // Handle PTY output
    this.ptyProcess.onData((data) => {
      this.handlePtyOutput(data);
    });

    // Handle PTY exit
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      process.stderr.write(`[wrapper:${this.config.name}] Process exited (code: ${exitCode}, signal: ${signal})\n`);
      this.running = false;
      this.client.destroy();

      // Clean up tmux session if using tmux
      if (this.tmuxSessionName) {
        try {
          execSync(`tmux kill-session -t ${this.tmuxSessionName} 2>/dev/null`);
        } catch {
          // Ignore
        }
      }

      // Exit the wrapper process with the same code as the wrapped process
      process.exit(exitCode);
    });

    // Forward stdin to PTY
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      if (this.ptyProcess) {
        this.ptyProcess.write(data.toString());
      }
    });

    // Handle terminal resize
    process.stdout.on('resize', () => {
      if (this.ptyProcess) {
        this.ptyProcess.resize(process.stdout.columns, process.stdout.rows);
      }
    });
  }

  /**
   * Stop the wrapped process.
   */
  stop(): void {
    if (!this.running) return;

    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = undefined;
    }

    this.client.destroy();
    this.running = false;
  }

  /**
   * Handle output from the PTY process.
   */
  private handlePtyOutput(data: string): void {
    // Track output timing for idle detection
    this.lastOutputTime = Date.now();

    // Raw mode: pass through everything without parsing
    if (this.config.raw) {
      process.stdout.write(data);
      return;
    }

    // Parse for relay commands
    const { commands, output } = this.parser.parse(data);

    // Send any extracted commands to relay
    for (const cmd of commands) {
      this.sendRelayCommand(cmd);
    }

    // Output to terminal (with relay commands filtered)
    process.stdout.write(output);

    // Buffer output and check for injection opportunity
    this.outputBuffer += data;
    this.scheduleMessageInjection();
  }

  /**
   * Schedule message injection after output settles.
   * We inject messages when there's been a pause in output (tool finished).
   */
  private scheduleMessageInjection(): void {
    // Clear any existing timer
    if (this.lastOutputFlush) {
      clearTimeout(this.lastOutputFlush as unknown as number);
    }

    // Schedule injection after 500ms of quiet (output stopped)
    this.lastOutputFlush = Date.now();
    setTimeout(() => {
      this.injectPendingMessages();
    }, 500);
  }

  /**
   * Inject pending relay messages into the output stream.
   * Claude will see these as part of the terminal output.
   * Then send a minimal trigger to stdin to prompt processing.
   */
  private injectPendingMessages(): void {
    if (this.pendingRelayMessages.length === 0) return;
    if (!this.running || !this.ptyProcess) return;

    // Check if output has actually settled (no new output in 500ms)
    const timeSinceOutput = Date.now() - this.lastOutputTime;
    if (timeSinceOutput < 400) {
      // Output still active, reschedule
      this.scheduleMessageInjection();
      return;
    }

    // Inject all pending messages to stdout (visible context)
    const messages = this.pendingRelayMessages.splice(0);

    for (const msg of messages) {
      const notification = `\n\n📨 [RELAY MESSAGE FROM ${msg.from}]: ${msg.body}\n`;
      process.stdout.write(notification);
      process.stderr.write(`[relay] Injected message from ${msg.from} into output\n`);
    }

    // Clear output buffer
    this.outputBuffer = '';

    // Now send a minimal trigger to stdin to prompt Claude to process
    // Using a short trigger instead of the full message for reliability
    setTimeout(() => {
      if (this.ptyProcess && this.running) {
        process.stderr.write(`[relay] Sending minimal trigger to stdin\n`);
        this.ptyProcess.write('respond to the relay message above\r');
      }
    }, 300);
  }

  /**
   * Send a parsed relay command to the daemon.
   * Includes deduplication to prevent sending the same message multiple times.
   */
  private sendRelayCommand(cmd: ParsedCommand): void {
    // Create a hash of the message for deduplication
    const msgHash = `${cmd.to}:${cmd.body}`;
    const now = Date.now();
    const lastSent = this.recentlySentMessages.get(msgHash);

    // Skip if same message was sent in the last 5 seconds
    if (lastSent && now - lastSent < 5000) {
      process.stderr.write(`[relay] Skipping duplicate message to ${cmd.to}\n`);
      return;
    }

    const success = this.client.sendMessage(cmd.to, cmd.body, cmd.kind, cmd.data);
    if (success) {
      this.recentlySentMessages.set(msgHash, now);
      // Clean up old entries
      for (const [hash, ts] of this.recentlySentMessages) {
        if (now - ts > 10000) this.recentlySentMessages.delete(hash);
      }
      process.stderr.write(`[relay → ${cmd.to}] ${cmd.body.substring(0, 50)}${cmd.body.length > 50 ? '...' : ''}\n`);
    } else {
      process.stderr.write(`[relay] Failed to send to ${cmd.to}\n`);
    }
  }

  /**
   * Handle incoming message from relay.
   *
   * Strategy:
   * - Always show notification in terminal (real-time visual cue)
   * - If inbox mode: also write to inbox file (for hook polling)
   * - No stdin injection (unreliable after a few rounds)
   */
  private handleIncomingMessage(from: string, payload: SendPayload): void {
    // Log to stderr
    process.stderr.write(`\n[relay ← ${from}] ${payload.body}\n`);

    if (!this.running || !this.ptyProcess) return;

    // Sanitize the message for display
    const sanitizedBody = payload.body.replace(/[\r\n]+/g, ' ').trim();

    // Always show notification in terminal (real-time visual cue)
    const notification = `\n\n📨 [RELAY MESSAGE FROM ${from}]: ${sanitizedBody}\n`;
    process.stdout.write(notification);

    // If inbox mode, also write to file for hook polling
    if (this.inbox) {
      this.inbox.addMessage(from, payload.body);
      process.stderr.write(`[relay] Message written to inbox file (hook will poll)\n`);
    }
  }

  /**
   * Process the next message in the queue when Claude is idle.
   */
  private processNextMessage(): void {
    if (this.messageQueue.length === 0) {
      this.processingMessage = false;
      process.stderr.write(`[inject] Queue empty, done processing\n`);
      return;
    }

    this.processingMessage = true;
    const msg = this.messageQueue.shift()!;
    process.stderr.write(`[inject] Processing message from ${msg.from}, waiting for idle...\n`);

    // Wait for Claude to be idle (no output for 2 seconds)
    this.waitForIdle().then(() => {
      if (!this.running) {
        this.processingMessage = false;
        return;
      }

      process.stderr.write(`[inject] Claude is idle, injecting message\n`);

      // Sanitize message: replace newlines with spaces, trim
      const sanitizedBody = msg.payload.body.replace(/[\r\n]+/g, ' ').trim();
      const injection = `Relay message from ${msg.from}: ${sanitizedBody}`;

      if (this.config.useOsascript) {
        // Use OS-level keyboard simulation (macOS)
        this.injectViaOsascript(injection).then(() => {
          setTimeout(() => this.processNextMessage(), 1000);
        });
      } else if (this.config.useTmux && this.tmuxSessionName) {
        // Use tmux send-keys for injection
        this.injectViaTmux(injection).then(() => {
          setTimeout(() => this.processNextMessage(), 1000);
        });
      } else {
        // Use direct PTY injection
        this.injectViaPty(injection).then(() => {
          setTimeout(() => this.processNextMessage(), 1000);
        });
      }
    });
  }

  /**
   * Inject message using osascript (macOS keyboard simulation).
   * This sends keystrokes at the OS level to the frontmost application.
   */
  private async injectViaOsascript(message: string): Promise<void> {
    try {
      // Escape special characters for AppleScript
      const escaped = message
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/'/g, "'");

      // First, send Escape to exit any special modes
      execSync(`osascript -e 'tell application "System Events" to key code 53'`); // ESC
      await new Promise(r => setTimeout(r, 100));

      // Clear line with Cmd+A then delete (select all in input, delete)
      execSync(`osascript -e 'tell application "System Events" to keystroke "u" using control down'`); // Ctrl+U
      await new Promise(r => setTimeout(r, 50));

      // Type the message
      process.stderr.write(`[inject] Sending via osascript: ${message.substring(0, 50)}...\n`);
      execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
      await new Promise(r => setTimeout(r, 100));

      // Send Enter
      process.stderr.write(`[inject] Sending Enter via osascript\n`);
      execSync(`osascript -e 'tell application "System Events" to key code 36'`); // Enter
    } catch (err) {
      process.stderr.write(`[inject] osascript error: ${err}\n`);
    }
  }

  /**
   * Inject message using tmux send-keys.
   */
  private async injectViaTmux(message: string): Promise<void> {
    if (!this.tmuxSessionName) return;

    try {
      // Escape special characters for tmux
      const escaped = message.replace(/'/g, "'\\''");

      // Send ESC to exit any special modes
      execSync(`tmux send-keys -t ${this.tmuxSessionName} Escape`);
      await new Promise(r => setTimeout(r, 50));

      // Clear line
      execSync(`tmux send-keys -t ${this.tmuxSessionName} C-u`);
      await new Promise(r => setTimeout(r, 50));

      // Send the message
      execSync(`tmux send-keys -t ${this.tmuxSessionName} '${escaped}'`);
      await new Promise(r => setTimeout(r, 100));

      // Send Enter
      process.stderr.write(`[inject] Sending Enter via tmux\n`);
      execSync(`tmux send-keys -t ${this.tmuxSessionName} Enter`);
    } catch (err) {
      process.stderr.write(`[inject] tmux send-keys error: ${err}\n`);
    }
  }

  /**
   * Inject message using direct PTY write.
   */
  private async injectViaPty(message: string): Promise<void> {
    if (!this.ptyProcess || !this.running) return;

    // Exit any special modes (INSERT, etc) first
    this.ptyProcess.write('\x1b'); // ESC
    this.ptyProcess.write('\x1b'); // Double ESC to be sure
    this.ptyProcess.write('\x15'); // Ctrl+U to clear line

    await new Promise(r => setTimeout(r, 100));

    // Type character by character
    await this.simulateTyping(message);

    await new Promise(r => setTimeout(r, 200));

    if (this.ptyProcess && this.running) {
      process.stderr.write(`[inject] Typing done, sending Enter\n`);
      this.ptyProcess.write('\r'); // Submit
    }
  }

  /**
   * Wait until Claude has been idle (no output) for a period.
   */
  private waitForIdle(idleMs = 2000, maxWaitMs = 30000): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkIdle = () => {
        if (!this.running) {
          resolve();
          return;
        }

        const timeSinceOutput = Date.now() - this.lastOutputTime;
        const totalWait = Date.now() - startTime;

        // If idle for long enough, or max wait exceeded, proceed
        if (timeSinceOutput >= idleMs) {
          process.stderr.write(`[inject] Idle detected (${timeSinceOutput}ms since output)\n`);
          resolve();
          return;
        }

        if (totalWait >= maxWaitMs) {
          process.stderr.write(`[inject] Max wait exceeded (${totalWait}ms), forcing inject\n`);
          resolve();
          return;
        }

        // Check again in 100ms
        setTimeout(checkIdle, 100);
      };

      checkIdle();
    });
  }

  /**
   * Simulate human typing by sending characters one at a time.
   */
  private async simulateTyping(text: string): Promise<void> {
    for (const char of text) {
      if (!this.ptyProcess || !this.running) return;
      this.ptyProcess.write(char);
      await new Promise(resolve => setTimeout(resolve, 5)); // 5ms per character
    }
  }

  /**
   * Check if wrapper is running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Get agent name.
   */
  get name(): string {
    return this.config.name;
  }
}
