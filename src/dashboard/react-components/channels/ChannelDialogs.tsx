/**
 * Channel Dialogs
 *
 * Confirmation dialogs for channel actions:
 * - Archive channel
 * - Delete channel
 * - Leave channel
 * - Create channel modal
 */

import React, { useState, useCallback } from 'react';
import type { Channel, ChannelVisibility, CreateChannelRequest } from './types';

// =============================================================================
// Archive Channel Dialog
// =============================================================================

export interface ArchiveChannelDialogProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ArchiveChannelDialog({
  channel,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: ArchiveChannelDialogProps) {
  if (!isOpen) return null;

  const isUnarchiving = channel.status === 'archived';

  return (
    <Dialog onClose={onClose}>
      <div className="p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center
            ${isUnarchiving ? 'bg-success/10' : 'bg-warning/10'}
          `}>
            {isUnarchiving ? (
              <UnarchiveIcon className="w-5 h-5 text-success" />
            ) : (
              <ArchiveIcon className="w-5 h-5 text-warning" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {isUnarchiving ? 'Unarchive' : 'Archive'} #{channel.name}?
            </h2>
          </div>
        </div>

        <p className="text-sm text-text-secondary mb-6">
          {isUnarchiving ? (
            <>
              This will restore the channel and make it visible to all members again.
              Messages will be preserved.
            </>
          ) : (
            <>
              Archiving this channel will move it to the Archived section. Members can
              still view message history, but no new messages can be sent. You can
              unarchive it later.
            </>
          )}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary hover:bg-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`
              px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2
              ${isUnarchiving
                ? 'bg-success/20 text-success hover:bg-success/30'
                : 'bg-warning/20 text-warning hover:bg-warning/30'}
            `}
          >
            {isLoading && <LoadingSpinner className="w-4 h-4" />}
            {isUnarchiving ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// =============================================================================
// Delete Channel Dialog
// =============================================================================

export interface DeleteChannelDialogProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DeleteChannelDialog({
  channel,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: DeleteChannelDialogProps) {
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const canDelete = confirmText === channel.name;

  return (
    <Dialog onClose={onClose}>
      <div className="p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
            <TrashIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Delete #{channel.name}?
            </h2>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-400 font-medium flex items-center gap-2">
            <WarningIcon className="w-4 h-4" />
            This action cannot be undone
          </p>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          Deleting this channel will permanently remove all messages and files.
          All {channel.memberCount} members will lose access.
        </p>

        <div className="mb-6">
          <label className="block text-sm text-text-muted mb-2">
            Type <span className="font-mono text-text-primary">{channel.name}</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={channel.name}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-red-500/50"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary hover:bg-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canDelete || isLoading}
            className="px-4 py-2 text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && <LoadingSpinner className="w-4 h-4" />}
            Delete Channel
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// =============================================================================
// Leave Channel Dialog
// =============================================================================

export interface LeaveChannelDialogProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function LeaveChannelDialog({
  channel,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: LeaveChannelDialogProps) {
  if (!isOpen) return null;

  return (
    <Dialog onClose={onClose}>
      <div className="p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-accent-cyan/10 flex items-center justify-center">
            <LeaveIcon className="w-5 h-5 text-accent-cyan" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Leave #{channel.name}?
            </h2>
          </div>
        </div>

        <p className="text-sm text-text-secondary mb-6">
          You'll no longer receive messages from this channel. You can rejoin at
          any time if the channel is public.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary hover:bg-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <LoadingSpinner className="w-4 h-4" />}
            Leave Channel
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// =============================================================================
// Create Channel Modal
// =============================================================================

export interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (request: CreateChannelRequest) => void;
  isLoading?: boolean;
  existingChannels?: string[];
}

export function CreateChannelModal({
  isOpen,
  onClose,
  onCreate,
  isLoading = false,
  existingChannels = [],
}: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ChannelVisibility>('public');

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    setVisibility('public');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onCreate({
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      description: description.trim() || undefined,
      visibility,
    });
  }, [name, description, visibility, onCreate]);

  if (!isOpen) return null;

  // Validate channel name
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-');
  const nameExists = existingChannels.includes(`#${normalizedName}`);
  const isValidName = normalizedName.length >= 2 && normalizedName.length <= 80 && /^[a-z0-9-]+$/.test(normalizedName);
  const canCreate = name.trim() && isValidName && !nameExists;

  return (
    <Dialog onClose={handleClose}>
      <form onSubmit={handleSubmit} className="p-6 w-[400px] max-w-full">
        <h2 className="text-lg font-semibold text-text-primary mb-6">
          Create a channel
        </h2>

        {/* Channel Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Channel name
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">#</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., engineering"
              className="w-full pl-7 pr-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-cyan/50"
              autoFocus
            />
          </div>
          {name && !isValidName && (
            <p className="mt-1 text-xs text-red-400">
              Channel names must be 2-80 characters, lowercase letters, numbers, and hyphens only
            </p>
          )}
          {nameExists && (
            <p className="mt-1 text-xs text-red-400">
              A channel with this name already exists
            </p>
          )}
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Description <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this channel about?"
            rows={2}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-cyan/50 resize-none"
          />
        </div>

        {/* Visibility */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Visibility
          </label>
          <div className="space-y-2">
            <label className={`
              flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
              ${visibility === 'public'
                ? 'border-accent-cyan/30 bg-accent-cyan/5'
                : 'border-border-subtle hover:bg-bg-hover'}
            `}>
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={visibility === 'public'}
                onChange={() => setVisibility('public')}
                className="mt-1"
              />
              <div>
                <div className="flex items-center gap-2">
                  <HashIcon className="w-4 h-4 text-text-primary" />
                  <span className="text-sm font-medium text-text-primary">Public</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Anyone can join and view messages
                </p>
              </div>
            </label>

            <label className={`
              flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
              ${visibility === 'private'
                ? 'border-accent-cyan/30 bg-accent-cyan/5'
                : 'border-border-subtle hover:bg-bg-hover'}
            `}>
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={visibility === 'private'}
                onChange={() => setVisibility('private')}
                className="mt-1"
              />
              <div>
                <div className="flex items-center gap-2">
                  <LockIcon className="w-4 h-4 text-text-primary" />
                  <span className="text-sm font-medium text-text-primary">Private</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Only invited members can join
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-bg-tertiary hover:bg-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canCreate || isLoading}
            className="px-4 py-2 text-sm font-medium bg-accent-cyan text-bg-deep hover:bg-accent-cyan/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && <LoadingSpinner className="w-4 h-4" />}
            Create Channel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// =============================================================================
// Base Dialog Component
// =============================================================================

function Dialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Content */}
      <div
        className="relative bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function UnarchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <path d="M12 12v6" />
      <path d="M9 15l3-3 3 3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function LeaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
