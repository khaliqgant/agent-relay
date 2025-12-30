/**
 * MentionAutocomplete Component
 *
 * Provides @-mention autocomplete for the message composer.
 * Shows a dropdown list of agents when typing @ at the start of a message.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Agent } from '../types';
import { getAgentColor, getAgentInitials } from '../lib/colors';

export interface MentionAutocompleteProps {
  /** List of available agents */
  agents: Agent[];
  /** Current input value */
  inputValue: string;
  /** Cursor position in input */
  cursorPosition: number;
  /** Called when a mention is selected */
  onSelect: (mention: string, newValue: string) => void;
  /** Called when autocomplete should be hidden */
  onClose: () => void;
  /** Whether the autocomplete is visible */
  isVisible: boolean;
}

interface MentionOption {
  name: string;
  displayName: string;
  description: string;
  isBroadcast?: boolean;
}

/**
 * Check if the input has an @-mention being typed at the start
 */
export function getMentionQuery(value: string, cursorPos: number): string | null {
  // Check if cursor is within an @mention at the start
  const atMatch = value.match(/^@(\S*)/);
  if (atMatch && cursorPos <= atMatch[0].length) {
    return atMatch[1]; // Return the text after @
  }
  return null;
}

/**
 * Complete a mention in the input value
 */
export function completeMentionInValue(
  value: string,
  mention: string
): string {
  const atMatch = value.match(/^@\S*/);
  if (atMatch) {
    // Replace the @partial with @CompletedName
    const completedText = `@${mention} `;
    return completedText + value.substring(atMatch[0].length);
  }
  return value;
}

export function MentionAutocomplete({
  agents,
  inputValue,
  cursorPosition,
  onSelect,
  onClose,
  isVisible,
}: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Get the current mention query
  const query = useMemo(
    () => getMentionQuery(inputValue, cursorPosition),
    [inputValue, cursorPosition]
  );

  // Filter options based on query
  const options = useMemo((): MentionOption[] => {
    if (query === null) return [];

    const queryLower = query.toLowerCase();
    const result: MentionOption[] = [];

    // Add broadcast option if it matches
    const broadcastMatches =
      '*'.includes(queryLower) ||
      'everyone'.includes(queryLower) ||
      'all'.includes(queryLower) ||
      'broadcast'.includes(queryLower) ||
      queryLower === '';

    if (broadcastMatches) {
      result.push({
        name: '*',
        displayName: '@everyone',
        description: 'Broadcast to all agents',
        isBroadcast: true,
      });
    }

    // Filter agents by name
    const matchingAgents = agents.filter((agent) =>
      agent.name.toLowerCase().includes(queryLower)
    );

    matchingAgents.forEach((agent) => {
      result.push({
        name: agent.name,
        displayName: `@${agent.name}`,
        description: agent.status || 'Agent',
      });
    });

    return result;
  }, [query, agents]);

  // Reset selection when options change
  useEffect(() => {
    setSelectedIndex(0);
  }, [options.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isVisible || options.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % options.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          const selected = options[selectedIndex];
          if (selected) {
            const newValue = completeMentionInValue(inputValue, selected.name);
            onSelect(selected.name, newValue);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isVisible, options, selectedIndex, inputValue, onSelect, onClose]
  );

  // Register keyboard listener
  useEffect(() => {
    if (isVisible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, handleKeyDown]);

  // Handle click on option
  const handleClick = useCallback(
    (option: MentionOption) => {
      const newValue = completeMentionInValue(inputValue, option.name);
      onSelect(option.name, newValue);
    },
    [inputValue, onSelect]
  );

  if (!isVisible || options.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 max-h-[200px] overflow-y-auto bg-[#1a1d21] border border-white/10 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-[100] mb-1"
      ref={listRef}
    >
      {options.map((option, index) => (
        <div
          key={option.name}
          data-selected={index === selectedIndex}
          className={`flex items-center gap-2.5 py-2 px-3 cursor-pointer transition-colors duration-150 ${
            index === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.08]'
          }`}
          onClick={() => handleClick(option)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-semibold"
            style={{
              background: option.isBroadcast
                ? 'var(--color-warning, #f59e0b)'
                : getAgentColor(option.name).primary,
            }}
          >
            {option.isBroadcast ? '*' : getAgentInitials(option.name)}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[#d1d2d3]">{option.displayName}</span>
            <span className="text-xs text-[#8d8d8e]">{option.description}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Hook to manage mention autocomplete state
 */
export function useMentionAutocomplete(agents: Agent[]) {
  const [isVisible, setIsVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);

  const handleInputChange = useCallback((value: string, cursorPos: number) => {
    setInputValue(value);
    setCursorPosition(cursorPos);

    // Show autocomplete if typing @mention at start
    const query = getMentionQuery(value, cursorPos);
    setIsVisible(query !== null);
  }, []);

  const handleSelect = useCallback((mention: string, newValue: string) => {
    setInputValue(newValue);
    setCursorPosition(newValue.indexOf(' ') + 1);
    setIsVisible(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
  }, []);

  return {
    isVisible,
    inputValue,
    cursorPosition,
    setInputValue: handleInputChange,
    handleSelect,
    handleClose,
  };
}
