/**
 * Dashboard Application Entry Point
 */

import { subscribe } from './state.js';
import { connect, sendMessage } from './websocket.js';
import {
  initElements,
  getElements,
  updateConnectionStatus,
  renderAgents,
  renderMessages,
  selectChannel,
  updateTargetSelect,
  updateOnlineCount,
  openCommandPalette,
  closeCommandPalette,
  filterPaletteResults,
} from './components.js';

/**
 * Initialize the dashboard application
 */
export function initApp(): void {
  const elements = initElements();

  // Subscribe to state changes
  subscribe(() => {
    updateConnectionStatus();
    renderAgents();
    renderMessages();
    updateTargetSelect();
    updateOnlineCount();
  });

  // Set up event listeners
  setupEventListeners(elements);

  // Connect to WebSocket
  connect();
}

/**
 * Set up all event listeners
 */
function setupEventListeners(elements: ReturnType<typeof getElements>): void {
  // Channel clicks
  elements.channelsList.querySelectorAll<HTMLElement>('.channel-item').forEach((item) => {
    item.addEventListener('click', () => {
      const channel = item.dataset.channel;
      if (channel) {
        selectChannel(channel);
      }
    });
  });

  // Send button
  elements.sendBtn.addEventListener('click', handleSend);

  // Keyboard shortcuts for composer
  elements.messageInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  elements.messageInput.addEventListener('input', () => {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height =
      Math.min(elements.messageInput.scrollHeight, 200) + 'px';
  });

  // Command palette
  elements.searchTrigger.addEventListener('click', openCommandPalette);

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (elements.commandPaletteOverlay.classList.contains('visible')) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    }

    if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });

  elements.commandPaletteOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === elements.commandPaletteOverlay) {
      closeCommandPalette();
    }
  });

  elements.paletteSearch.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    filterPaletteResults(target.value);
  });

  // Command execution
  document.querySelectorAll<HTMLElement>('.palette-item[data-command]').forEach((item) => {
    item.addEventListener('click', () => {
      const command = item.dataset.command;

      if (command === 'broadcast') {
        elements.targetSelect.value = '*';
        elements.messageInput.focus();
      } else if (command === 'clear') {
        elements.messagesList.innerHTML = '';
      }

      closeCommandPalette();
    });
  });
}

/**
 * Handle send button click
 */
async function handleSend(): Promise<void> {
  const elements = getElements();
  const to = elements.targetSelect.value;
  const message = elements.messageInput.value.trim();

  if (!to) {
    alert('Please select a recipient');
    return;
  }

  if (!message) {
    return;
  }

  elements.sendBtn.disabled = true;

  const result = await sendMessage(to, message);

  if (result.success) {
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
  } else {
    alert(result.error);
  }

  elements.sendBtn.disabled = false;
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
