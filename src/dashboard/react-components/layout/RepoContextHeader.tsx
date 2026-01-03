/**
 * RepoContextHeader Component
 *
 * Slack-style repo indicator in the header with quick switcher dropdown.
 * Shows current repo/project and allows switching between connected projects.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Project } from '../../types';

export interface RepoContextHeaderProps {
  /** All connected projects */
  projects: Project[];
  /** Currently active project */
  currentProject: Project | null;
  /** Callback when user selects a project */
  onProjectChange: (project: Project) => void;
}

export function RepoContextHeader({
  projects,
  currentProject,
  onProjectChange,
}: RepoContextHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasMultipleProjects = projects.length > 1;

  // Format project name for display (extract org/repo from path)
  const formatProjectName = (project: Project | null): string => {
    if (!project) return 'No project';

    if (project.name) return project.name;

    // Extract last two path segments for "org/repo" format
    const segments = project.path.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
    }
    return segments[segments.length - 1] || project.id;
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < projects.length - 1 ? prev + 1 : 0;
            buttonRefs.current[next]?.focus();
            return next;
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : projects.length - 1;
            buttonRefs.current[next]?.focus();
            return next;
          });
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < projects.length) {
            onProjectChange(projects[focusedIndex]);
            setIsOpen(false);
            setFocusedIndex(-1);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, projects, onProjectChange]);

  // Reset focus when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Focus current project or first item
      const currentIndex = projects.findIndex((p) => p.id === currentProject?.id);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, projects, currentProject]);

  // Don't render if no projects
  if (projects.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
          hasMultipleProjects
            ? 'bg-bg-tertiary/80 border-border-subtle hover:bg-bg-elevated hover:border-border-medium cursor-pointer'
            : 'bg-transparent border-transparent cursor-default'
        }`}
        onClick={() => hasMultipleProjects && setIsOpen(!isOpen)}
        disabled={!hasMultipleProjects}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <RepoIcon />
        <span className="text-text-primary truncate max-w-[200px]">
          {formatProjectName(currentProject)}
        </span>
        {hasMultipleProjects && (
          <ChevronIcon isOpen={isOpen} />
        )}
      </button>

      {/* Dropdown */}
      {isOpen && hasMultipleProjects && (
        <div className="absolute top-[calc(100%+4px)] left-0 min-w-[280px] bg-bg-primary border border-border-subtle rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.4)] z-[1000] overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border-subtle">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Switch Project
            </span>
          </div>

          {/* Project List */}
          <div className="max-h-[300px] overflow-y-auto py-1" role="listbox">
            {projects.map((project, index) => {
              const isActive = currentProject?.id === project.id;
              const isFocused = focusedIndex === index;
              const displayName = formatProjectName(project);
              const agentCount = project.agents?.length || 0;

              return (
                <button
                  key={project.id}
                  ref={(el) => { buttonRefs.current[index] = el; }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-none cursor-pointer ${
                    isActive
                      ? 'bg-accent-cyan/10 text-accent-cyan'
                      : isFocused
                        ? 'bg-bg-hover text-text-primary'
                        : 'bg-transparent text-text-primary hover:bg-bg-hover'
                  }`}
                  onClick={() => {
                    onProjectChange(project);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={isFocused ? 0 : -1}
                >
                  <RepoIcon className={isActive ? 'text-accent-cyan' : 'text-text-muted'} />

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {displayName}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {project.path}
                    </div>
                  </div>

                  {/* Agent count badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-accent-cyan/20 text-accent-cyan'
                      : 'bg-bg-tertiary text-text-muted'
                  }`}>
                    {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
                  </span>

                  {/* Lead indicator */}
                  {project.lead?.connected && (
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" title={`Lead: ${project.lead.name}`} />
                  )}

                  {/* Checkmark for active */}
                  {isActive && (
                    <CheckIcon />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RepoIcon({ className = 'text-text-muted' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`text-text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-accent-cyan"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
