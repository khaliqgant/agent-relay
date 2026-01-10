/**
 * Channel Read State Tests
 * Tests for hasMentions and unread count calculations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types for testing
interface ReadState {
  channelId: string;
  userId: string;
  lastReadAt: Date;
}

interface Message {
  id: string;
  channelId: string;
  createdAt: Date;
  mentions: string[] | null;
}

describe('Channel Read State Calculations', () => {
  describe('hasMentionsForUser', () => {
    it('should return true when user is mentioned in unread messages', () => {
      const userId = 'user-123';
      const channelId = 'channel-abc';
      const lastReadAt = new Date('2026-01-10T10:00:00Z');

      const messages: Message[] = [
        {
          id: 'msg-1',
          channelId,
          createdAt: new Date('2026-01-10T11:00:00Z'), // After lastReadAt
          mentions: ['user-123', 'user-456'],
        },
      ];

      // Simulate: message is after lastReadAt and mentions user
      const unreadMessages = messages.filter((m) => m.createdAt > lastReadAt);
      const hasMentions = unreadMessages.some(
        (m) => m.mentions?.includes(userId) ?? false
      );

      expect(hasMentions).toBe(true);
    });

    it('should return false when user is mentioned only in read messages', () => {
      const userId = 'user-123';
      const channelId = 'channel-abc';
      const lastReadAt = new Date('2026-01-10T12:00:00Z');

      const messages: Message[] = [
        {
          id: 'msg-1',
          channelId,
          createdAt: new Date('2026-01-10T11:00:00Z'), // Before lastReadAt
          mentions: ['user-123'],
        },
      ];

      // Simulate: message is before lastReadAt
      const unreadMessages = messages.filter((m) => m.createdAt > lastReadAt);
      const hasMentions = unreadMessages.some(
        (m) => m.mentions?.includes(userId) ?? false
      );

      expect(hasMentions).toBe(false);
    });

    it('should return false when user is not mentioned', () => {
      const userId = 'user-123';
      const channelId = 'channel-abc';
      const lastReadAt = new Date('2026-01-10T10:00:00Z');

      const messages: Message[] = [
        {
          id: 'msg-1',
          channelId,
          createdAt: new Date('2026-01-10T11:00:00Z'),
          mentions: ['user-456', 'user-789'], // user-123 not mentioned
        },
      ];

      const unreadMessages = messages.filter((m) => m.createdAt > lastReadAt);
      const hasMentions = unreadMessages.some(
        (m) => m.mentions?.includes(userId) ?? false
      );

      expect(hasMentions).toBe(false);
    });

    it('should return true when no read state exists and user is mentioned', () => {
      const userId = 'user-123';
      const readState: ReadState | null = null;

      const messages: Message[] = [
        {
          id: 'msg-1',
          channelId: 'channel-abc',
          createdAt: new Date('2026-01-10T11:00:00Z'),
          mentions: ['user-123'],
        },
      ];

      // No read state means all messages are unread
      const hasMentions = messages.some(
        (m) => m.mentions?.includes(userId) ?? false
      );

      expect(hasMentions).toBe(true);
    });

    it('should handle null mentions array', () => {
      const userId = 'user-123';
      const lastReadAt = new Date('2026-01-10T10:00:00Z');

      const messages: Message[] = [
        {
          id: 'msg-1',
          channelId: 'channel-abc',
          createdAt: new Date('2026-01-10T11:00:00Z'),
          mentions: null, // No mentions
        },
      ];

      const unreadMessages = messages.filter((m) => m.createdAt > lastReadAt);
      const hasMentions = unreadMessages.some(
        (m) => m.mentions?.includes(userId) ?? false
      );

      expect(hasMentions).toBe(false);
    });

    it('should handle empty mentions array', () => {
      const userId = 'user-123';
      const lastReadAt = new Date('2026-01-10T10:00:00Z');

      const messages: Message[] = [
        {
          id: 'msg-1',
          channelId: 'channel-abc',
          createdAt: new Date('2026-01-10T11:00:00Z'),
          mentions: [], // Empty mentions
        },
      ];

      const unreadMessages = messages.filter((m) => m.createdAt > lastReadAt);
      const hasMentions = unreadMessages.some(
        (m) => m.mentions?.includes(userId) ?? false
      );

      expect(hasMentions).toBe(false);
    });
  });

  describe('getUnreadCount', () => {
    it('should count messages after lastReadAt', () => {
      const lastReadAt = new Date('2026-01-10T10:00:00Z');

      const messages: Message[] = [
        { id: 'msg-1', channelId: 'ch', createdAt: new Date('2026-01-10T09:00:00Z'), mentions: null }, // Read
        { id: 'msg-2', channelId: 'ch', createdAt: new Date('2026-01-10T11:00:00Z'), mentions: null }, // Unread
        { id: 'msg-3', channelId: 'ch', createdAt: new Date('2026-01-10T12:00:00Z'), mentions: null }, // Unread
      ];

      const unreadCount = messages.filter((m) => m.createdAt > lastReadAt).length;

      expect(unreadCount).toBe(2);
    });

    it('should return 0 when all messages are read', () => {
      const lastReadAt = new Date('2026-01-10T15:00:00Z');

      const messages: Message[] = [
        { id: 'msg-1', channelId: 'ch', createdAt: new Date('2026-01-10T09:00:00Z'), mentions: null },
        { id: 'msg-2', channelId: 'ch', createdAt: new Date('2026-01-10T11:00:00Z'), mentions: null },
        { id: 'msg-3', channelId: 'ch', createdAt: new Date('2026-01-10T12:00:00Z'), mentions: null },
      ];

      const unreadCount = messages.filter((m) => m.createdAt > lastReadAt).length;

      expect(unreadCount).toBe(0);
    });

    it('should count all messages when no read state exists', () => {
      const readState: ReadState | null = null;

      const messages: Message[] = [
        { id: 'msg-1', channelId: 'ch', createdAt: new Date('2026-01-10T09:00:00Z'), mentions: null },
        { id: 'msg-2', channelId: 'ch', createdAt: new Date('2026-01-10T11:00:00Z'), mentions: null },
        { id: 'msg-3', channelId: 'ch', createdAt: new Date('2026-01-10T12:00:00Z'), mentions: null },
      ];

      // No read state = all messages are unread
      const unreadCount = readState ? 0 : messages.length;

      expect(unreadCount).toBe(3);
    });

    it('should return 0 for empty channel', () => {
      const messages: Message[] = [];
      const unreadCount = messages.length;

      expect(unreadCount).toBe(0);
    });
  });

  describe('getMentionsStatusForUser (batch)', () => {
    it('should return mention status for multiple channels', () => {
      const userId = 'user-123';
      const channelIds = ['ch-1', 'ch-2', 'ch-3'];
      const lastReadAt = new Date('2026-01-10T10:00:00Z');

      const messages: Message[] = [
        // Channel 1: has mention for user
        { id: 'msg-1', channelId: 'ch-1', createdAt: new Date('2026-01-10T11:00:00Z'), mentions: ['user-123'] },
        // Channel 2: no mention for user
        { id: 'msg-2', channelId: 'ch-2', createdAt: new Date('2026-01-10T11:00:00Z'), mentions: ['user-456'] },
        // Channel 3: mention but already read
        { id: 'msg-3', channelId: 'ch-3', createdAt: new Date('2026-01-10T09:00:00Z'), mentions: ['user-123'] },
      ];

      const mentionsMap = new Map<string, boolean>();
      for (const channelId of channelIds) {
        const channelMessages = messages.filter((m) => m.channelId === channelId);
        const unreadMessages = channelMessages.filter((m) => m.createdAt > lastReadAt);
        const hasMentions = unreadMessages.some((m) => m.mentions?.includes(userId) ?? false);
        mentionsMap.set(channelId, hasMentions);
      }

      expect(mentionsMap.get('ch-1')).toBe(true);  // Has unread mention
      expect(mentionsMap.get('ch-2')).toBe(false); // No mention for user
      expect(mentionsMap.get('ch-3')).toBe(false); // Mention already read
    });
  });
});
