/**
 * Workspace Settings Panel
 *
 * Modal/panel for managing workspace settings:
 * - Rename workspace
 * - Add/remove repositories
 * - View linked repositories
 */

import React, { useState, useEffect, useCallback } from 'react';

export interface WorkspaceRepo {
  id: string;
  githubFullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
}

export interface AvailableRepo {
  id: string;
  githubFullName: string;
  isPrivate: boolean;
}

export interface WorkspaceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  apiBaseUrl: string;
  onWorkspaceUpdated?: () => void;
}

export function WorkspaceSettingsPanel({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  isOwner,
  apiBaseUrl,
  onWorkspaceUpdated,
}: WorkspaceSettingsProps) {
  const [name, setName] = useState(workspaceName);
  const [repos, setRepos] = useState<WorkspaceRepo[]>([]);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAddRepo, setShowAddRepo] = useState(false);

  // Fetch workspace repos and available repos
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch workspace repos
      const reposRes = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/repos`, {
        credentials: 'include',
      });
      if (reposRes.ok) {
        const data = await reposRes.json();
        setRepos(data.repositories || []);
      }

      // Fetch user's available repos (not yet linked to this workspace)
      const availableRes = await fetch(`${apiBaseUrl}/repos`, {
        credentials: 'include',
      });
      if (availableRes.ok) {
        const data = await availableRes.json();
        setAvailableRepos(data.repositories || []);
      }
    } catch (err) {
      setError('Failed to load workspace data');
      console.error('Error fetching workspace data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, workspaceId]);

  useEffect(() => {
    if (isOpen) {
      setName(workspaceName);
      fetchData();
    }
  }, [isOpen, workspaceName, fetchData]);

  const handleRename = async () => {
    if (!name.trim() || name === workspaceName) return;

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rename workspace');
      }

      setSuccessMessage('Workspace renamed successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
      onWorkspaceUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename workspace');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRepo = async (repoId: string) => {
    if (!confirm('Remove this repository from the workspace?')) return;

    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/repos/${repoId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove repository');
      }

      setRepos(repos.filter(r => r.id !== repoId));
      setSuccessMessage('Repository removed');
      setTimeout(() => setSuccessMessage(null), 3000);
      onWorkspaceUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove repository');
    }
  };

  const handleAddRepo = async (repoId: string) => {
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/repos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repositoryIds: [repoId] }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add repository');
      }

      // Refresh data
      await fetchData();
      setShowAddRepo(false);
      setSuccessMessage('Repository added');
      setTimeout(() => setSuccessMessage(null), 3000);
      onWorkspaceUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repository');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Filter out repos already in the workspace
  const linkedRepoIds = new Set(repos.map(r => r.id));
  const unlinkedRepos = availableRepos.filter(r => !linkedRepoIds.has(r.id));

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-[#1a1a2e] border border-[#3a3a4e] rounded-xl p-6 min-w-[500px] max-w-[700px] max-h-[80vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="m-0 text-lg font-semibold text-[#e8e8e8]">Workspace Settings</h2>
          <button
            className="bg-transparent border-none text-[#666] cursor-pointer p-1 flex items-center justify-center rounded transition-all hover:bg-white/10 hover:text-[#e8e8e8]"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-md text-red-500 text-[13px] mb-4">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="px-3 py-2.5 bg-green-500/10 border border-green-500/30 rounded-md text-green-500 text-[13px] mb-4">
            {successMessage}
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-[#666]">Loading...</div>
        ) : (
          <>
            {/* Rename Section */}
            <div className="mb-6">
              <label className="block mb-2 text-[13px] font-medium text-[#e8e8e8]">
                Workspace Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner || isSaving}
                  className="flex-1 px-3 py-2.5 bg-[#2a2a3e] border border-[#3a3a4e] rounded-md text-[#e8e8e8] text-sm outline-none transition-colors focus:border-[#00c896] disabled:opacity-60 disabled:cursor-not-allowed"
                />
                {isOwner && name !== workspaceName && (
                  <button
                    onClick={handleRename}
                    disabled={isSaving}
                    className="px-4 py-2.5 bg-[#00c896] border-none rounded-md text-[#1a1a2e] text-sm font-medium cursor-pointer transition-all hover:bg-[#00a87d] disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
              {!isOwner && (
                <p className="mt-1.5 text-xs text-[#666]">Only the workspace owner can rename it.</p>
              )}
            </div>

            {/* Repositories Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[13px] font-medium text-[#e8e8e8]">
                  Repositories ({repos.length})
                </label>
                {isOwner && (
                  <button
                    onClick={() => setShowAddRepo(!showAddRepo)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-transparent border border-[#3a3a4e] rounded-md text-[#888] text-xs cursor-pointer transition-all hover:bg-white/5 hover:text-[#e8e8e8]"
                  >
                    <PlusIcon />
                    Add Repository
                  </button>
                )}
              </div>

              {/* Add Repo Dropdown */}
              {showAddRepo && unlinkedRepos.length > 0 && (
                <div className="mb-3 p-3 bg-[#2a2a3e] border border-[#3a3a4e] rounded-md">
                  <p className="text-xs text-[#888] mb-2">Select a repository to add:</p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {unlinkedRepos.map(repo => (
                      <button
                        key={repo.id}
                        onClick={() => handleAddRepo(repo.id)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-transparent border-none rounded text-left text-[#e8e8e8] text-sm cursor-pointer transition-colors hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <RepoIcon />
                          {repo.githubFullName}
                        </span>
                        {repo.isPrivate && (
                          <span className="text-xs text-[#666] bg-white/5 px-1.5 py-0.5 rounded">Private</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showAddRepo && unlinkedRepos.length === 0 && (
                <div className="mb-3 p-3 bg-[#2a2a3e] border border-[#3a3a4e] rounded-md text-center text-[#666] text-sm">
                  No additional repositories available to add.
                </div>
              )}

              {/* Linked Repos List */}
              {repos.length === 0 ? (
                <div className="py-6 text-center text-[#666] text-sm bg-[#2a2a3e] rounded-md border border-[#3a3a4e]">
                  No repositories linked to this workspace.
                </div>
              ) : (
                <div className="space-y-2">
                  {repos.map(repo => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between px-3 py-2.5 bg-[#2a2a3e] border border-[#3a3a4e] rounded-md"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <RepoIcon />
                        <div className="min-w-0">
                          <div className="text-sm text-[#e8e8e8] truncate">{repo.githubFullName}</div>
                          <div className="flex items-center gap-2 text-xs text-[#666]">
                            <span>{repo.defaultBranch}</span>
                            {repo.isPrivate && <span>Private</span>}
                          </div>
                        </div>
                      </div>
                      {isOwner && repos.length > 1 && (
                        <button
                          onClick={() => handleRemoveRepo(repo.id)}
                          className="p-1.5 bg-transparent border-none text-[#666] cursor-pointer rounded transition-all hover:bg-red-500/10 hover:text-red-500"
                          title="Remove from workspace"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {repos.length === 1 && isOwner && (
                <p className="mt-2 text-xs text-[#666]">
                  A workspace must have at least one repository.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 border-t border-[#3a3a4e]">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-transparent border border-[#3a3a4e] rounded-md text-[#e8e8e8] text-sm font-medium cursor-pointer transition-all hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#888] flex-shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
