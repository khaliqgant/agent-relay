/**
 * Dashboard UI Components
 */

import type { Agent, Message, DOMElements, ChannelType } from './types.js';
import { state, getFilteredMessages, setCurrentChannel } from './state.js';
import {
  escapeHtml,
  formatTime,
  formatDate,
  getAvatarColor,
  getInitials,
  formatMessageBody,
  isAgentOnline,
} from './utils.js';

let elements: DOMElements;

/**
 * Initialize DOM element references
 */
export function initElements(): DOMElements {
  elements = {
    connectionDot: document.getElementById('connection-dot')!,
    channelsList: document.getElementById('channels-list')!,
    agentsList: document.getElementById('agents-list')!,
    messagesList: document.getElementById('messages-list')!,
    currentChannelName: document.getElementById('current-channel-name')!,
    channelTopic: document.getElementById('channel-topic')!,
    onlineCount: document.getElementById('online-count')!,
    targetSelect: document.getElementById('target-select') as HTMLSelectElement,
    messageInput: document.getElementById('message-input') as HTMLTextAreaElement,
    sendBtn: document.getElementById('send-btn') as HTMLButtonElement,
    searchTrigger: document.getElementById('search-trigger')!,
    commandPaletteOverlay: document.getElementById('command-palette-overlay')!,
    paletteSearch: document.getElementById('palette-search') as HTMLInputElement,
    paletteResults: document.getElementById('palette-results')!,
    paletteAgentsSection: document.getElementById('palette-agents-section')!,
    paletteMessagesSection: document.getElementById('palette-messages-section')!,
    typingIndicator: document.getElementById('typing-indicator')!,
  };
  return elements;
}

/**
 * Get DOM elements
 */
export function getElements(): DOMElements {
  return elements;
}

/**
 * Update connection status indicator
 */
export function updateConnectionStatus(): void {
  if (state.isConnected) {
    elements.connectionDot.classList.remove('offline');
  } else {
    elements.connectionDot.classList.add('offline');
  }
}

/**
 * Render agents list in sidebar
 */
export function renderAgents(): void {
  const html = state.agents
    .map((agent) => {
      const online = isAgentOnline(agent.lastSeen || agent.lastActive);
      const presenceClass = online ? 'online' : '';
      const isActive = state.currentChannel === agent.name;

      return `
      <li class="channel-item ${isActive ? 'active' : ''}" data-agent="${escapeHtml(agent.name)}">
        <div class="agent-avatar" style="background: ${getAvatarColor(agent.name)}">
          ${getInitials(agent.name)}
          <span class="presence-indicator ${presenceClass}"></span>
        </div>
        <span class="channel-name">${escapeHtml(agent.name)}</span>
      </li>
    `;
    })
    .join('');

  elements.agentsList.innerHTML =
    html ||
    '<li class="channel-item" style="color: var(--text-muted); cursor: default;">No agents connected</li>';

  // Add click handlers
  elements.agentsList.querySelectorAll<HTMLElement>('.channel-item[data-agent]').forEach((item) => {
    item.addEventListener('click', () => {
      const agentName = item.dataset.agent;
      if (agentName) {
        selectChannel(agentName);
      }
    });
  });

  // Update command palette agents
  updatePaletteAgents();
}

/**
 * Render messages list
 */
export function renderMessages(): void {
  const filtered = getFilteredMessages();

  if (filtered.length === 0) {
    elements.messagesList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="empty-state-title">No messages yet</div>
        <div class="empty-state-text">
          ${
            state.currentChannel === 'general'
              ? 'Messages between agents will appear here'
              : state.currentChannel === 'broadcasts'
                ? 'Broadcast messages will appear here'
                : `Messages with ${state.currentChannel} will appear here`
          }
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  let lastDate: string | null = null;

  filtered.forEach((msg) => {
    const msgDate = new Date(msg.timestamp).toDateString();

    // Add date divider if needed
    if (msgDate !== lastDate) {
      html += `
        <div class="date-divider">
          <span class="date-divider-text">${formatDate(msg.timestamp)}</span>
        </div>
      `;
      lastDate = msgDate;
    }

    const isBroadcast = msg.to === '*';
    const avatarColor = getAvatarColor(msg.from);

    html += `
      <div class="message ${isBroadcast ? 'broadcast' : ''}" data-id="${escapeHtml(msg.id)}">
        <div class="message-avatar" style="background: ${avatarColor}">
          ${getInitials(msg.from)}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">${escapeHtml(msg.from)}</span>
            <span class="message-recipient">
              to <span class="target">${isBroadcast ? 'everyone' : escapeHtml(msg.to)}</span>
            </span>
            <span class="message-timestamp">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-body">${formatMessageBody(msg.content)}</div>
          ${
            msg.thread
              ? `
            <div class="thread-indicator" data-thread="${escapeHtml(msg.thread)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Thread: ${escapeHtml(msg.thread)}
            </div>
          `
              : ''
          }
        </div>
        <div class="message-actions">
          <button class="message-action-btn" title="Reply in thread">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button class="message-action-btn" title="Add reaction">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  });

  elements.messagesList.innerHTML = html;

  // Scroll to bottom
  const container = elements.messagesList.parentElement;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Select a channel and update UI
 */
export function selectChannel(channel: ChannelType): void {
  setCurrentChannel(channel);

  // Update sidebar active states
  elements.channelsList.querySelectorAll<HTMLElement>('.channel-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.channel === channel);
  });
  elements.agentsList.querySelectorAll<HTMLElement>('.channel-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.agent === channel);
  });

  // Update header
  const prefixEl = document.querySelector('.channel-header-name .prefix');
  if (channel === 'general') {
    elements.currentChannelName.innerHTML = 'general';
    elements.channelTopic.textContent = 'All agent communications';
    if (prefixEl) prefixEl.textContent = '#';
  } else if (channel === 'broadcasts') {
    elements.currentChannelName.innerHTML = 'broadcasts';
    elements.channelTopic.textContent = 'Messages sent to everyone';
    if (prefixEl) prefixEl.textContent = '#';
  } else {
    elements.currentChannelName.innerHTML = escapeHtml(channel);
    const agent = state.agents.find((a) => a.name === channel);
    elements.channelTopic.textContent = agent?.status || 'Direct messages';
    if (prefixEl) prefixEl.textContent = '@';

    // Pre-select agent in composer
    elements.targetSelect.value = channel;
  }

  // Update composer placeholder
  elements.messageInput.placeholder =
    channel === 'general' || channel === 'broadcasts'
      ? `Message #${channel}`
      : `Message ${channel}`;

  // Re-render messages
  renderMessages();
}

/**
 * Update target select dropdown with agents
 */
export function updateTargetSelect(): void {
  const currentValue = elements.targetSelect.value;

  const options = state.agents
    .map((a) => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`)
    .join('');

  elements.targetSelect.innerHTML = `
    <option value="">Select recipient...</option>
    <option value="*">Everyone (broadcast)</option>
    ${options}
  `;

  // Restore selection
  if (currentValue && (currentValue === '*' || state.agents.some((a) => a.name === currentValue))) {
    elements.targetSelect.value = currentValue;
  }
}

/**
 * Update online count display
 */
export function updateOnlineCount(): void {
  const online = state.agents.filter((a) => isAgentOnline(a.lastSeen || a.lastActive)).length;
  elements.onlineCount.textContent = `${online} online`;
}

/**
 * Update agents in command palette
 */
export function updatePaletteAgents(): void {
  const html = state.agents
    .map((agent) => {
      const online = isAgentOnline(agent.lastSeen || agent.lastActive);
      return `
      <div class="palette-item" data-jump-agent="${escapeHtml(agent.name)}">
        <div class="palette-item-icon">
          <div class="agent-avatar" style="background: ${getAvatarColor(agent.name)}; width: 20px; height: 20px; font-size: 9px;">
            ${getInitials(agent.name)}
            <span class="presence-indicator ${online ? 'online' : ''}"></span>
          </div>
        </div>
        <div class="palette-item-content">
          <div class="palette-item-title">${escapeHtml(agent.name)}</div>
          <div class="palette-item-subtitle">${online ? 'Online' : 'Offline'}</div>
        </div>
      </div>
    `;
    })
    .join('');

  const section = elements.paletteAgentsSection;
  const items = section.querySelectorAll('.palette-item');
  items.forEach((item) => item.remove());
  section.insertAdjacentHTML('beforeend', html);

  // Add click handlers
  section.querySelectorAll<HTMLElement>('.palette-item[data-jump-agent]').forEach((item) => {
    item.addEventListener('click', () => {
      const agentName = item.dataset.jumpAgent;
      if (agentName) {
        selectChannel(agentName);
        closeCommandPalette();
      }
    });
  });
}

/**
 * Open command palette
 */
export function openCommandPalette(): void {
  elements.commandPaletteOverlay.classList.add('visible');
  elements.paletteSearch.value = '';
  elements.paletteSearch.focus();
  filterPaletteResults('');
}

/**
 * Close command palette
 */
export function closeCommandPalette(): void {
  elements.commandPaletteOverlay.classList.remove('visible');
}

/**
 * Filter command palette results based on query
 */
export function filterPaletteResults(query: string): void {
  const q = query.toLowerCase();

  // Filter command items
  document.querySelectorAll<HTMLElement>('.palette-item[data-command]').forEach((item) => {
    const titleEl = item.querySelector('.palette-item-title');
    const title = titleEl?.textContent?.toLowerCase() || '';
    item.style.display = title.includes(q) ? 'flex' : 'none';
  });

  // Filter agent items
  document.querySelectorAll<HTMLElement>('.palette-item[data-jump-agent]').forEach((item) => {
    const name = item.dataset.jumpAgent?.toLowerCase() || '';
    item.style.display = name.includes(q) ? 'flex' : 'none';
  });

  // Show message search if query is long enough
  if (q.length >= 2) {
    const matches = state.messages.filter((m) => m.content.toLowerCase().includes(q)).slice(0, 5);

    if (matches.length > 0) {
      elements.paletteMessagesSection.style.display = 'block';
      const items = matches
        .map(
          (m) => `
        <div class="palette-item" data-jump-message="${escapeHtml(m.id)}">
          <div class="palette-item-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="palette-item-content">
            <div class="palette-item-title">${escapeHtml(m.from)}</div>
            <div class="palette-item-subtitle">${escapeHtml(m.content.substring(0, 60))}${m.content.length > 60 ? '...' : ''}</div>
          </div>
        </div>
      `
        )
        .join('');

      const existingItems = elements.paletteMessagesSection.querySelectorAll('.palette-item');
      existingItems.forEach((item) => item.remove());
      elements.paletteMessagesSection.insertAdjacentHTML('beforeend', items);
    } else {
      elements.paletteMessagesSection.style.display = 'none';
    }
  } else {
    elements.paletteMessagesSection.style.display = 'none';
  }
}
