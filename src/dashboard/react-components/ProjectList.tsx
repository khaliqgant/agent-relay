/**
 * ProjectList Component
 *
 * Displays projects with nested agents in a flat hierarchy.
 * Each project is a collapsible section with its agents listed directly underneath.
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { Agent, Project } from '../types';
import { AgentCard } from './AgentCard';
import { STATUS_COLORS, getAgentColor } from '../lib/colors';

/**
 * Gets the simple display name for an agent within a team group.
 * Since the team header already shows context, just show the agent's role/name.
 *
 * Examples:
 * - "Frontend-Lead" in team "Frontend" → "Lead"
 * - "Lead" in team "Lead" → "Lead"
 * - "backend-api" in team "backend" → "Api"
 */
function stripTeamPrefix(agentName: string, teamName: string): string {
  const lowerAgent = agentName.toLowerCase();
  const lowerTeam = teamName.toLowerCase().replace(/-?team$/i, '');

  // Pattern 1: Team prefix with dash separator (e.g., "frontend-lead" → "lead")
  if (lowerTeam && lowerAgent.startsWith(lowerTeam + '-')) {
    const stripped = agentName.substring(lowerTeam.length + 1);
    return capitalizeWords(stripped);
  }

  // Pattern 2: Team prefix with underscore separator
  if (lowerTeam && lowerAgent.startsWith(lowerTeam + '_')) {
    const stripped = agentName.substring(lowerTeam.length + 1);
    return capitalizeWords(stripped);
  }

  // Pattern 3: Last segment of hyphenated name (e.g., "LeadFrontend-Dev" → "Dev")
  const parts = agentName.split('-');
  if (parts.length > 1) {
    return capitalizeWords(parts[parts.length - 1]);
  }

  // No prefix to strip, return capitalized original
  return capitalizeWords(agentName);
}

/**
 * Capitalizes words in a string (handles dash and underscore separators)
 */
function capitalizeWords(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export interface ProjectListProps {
  projects: Project[];
  localAgents?: Agent[];
  currentProject?: string;
  selectedAgent?: string;
  searchQuery?: string;
  onProjectSelect?: (project: Project) => void;
  onAgentSelect?: (agent: Agent, project?: Project) => void;
  onReleaseClick?: (agent: Agent) => void;
  onLogsClick?: (agent: Agent) => void;
  compact?: boolean;
}

export function ProjectList({
  projects,
  localAgents = [],
  currentProject,
  selectedAgent,
  searchQuery = '',
  onProjectSelect,
  onAgentSelect,
  onReleaseClick,
  onLogsClick,
  compact = false,
}: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.id))
  );

  // Filter projects and agents based on search query
  const filteredData = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return { projects, localAgents };
    }

    // Filter local agents
    const filteredLocal = localAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.currentTask?.toLowerCase().includes(query)
    );

    // Filter projects (show project if name matches OR any agent matches)
    const filteredProjects = projects
      .map((project) => {
        const projectNameMatches =
          project.name?.toLowerCase().includes(query) ||
          project.path.toLowerCase().includes(query);

        const filteredAgents = project.agents.filter(
          (a) =>
            a.name.toLowerCase().includes(query) ||
            a.currentTask?.toLowerCase().includes(query)
        );

        // Include project if name matches or has matching agents
        if (projectNameMatches || filteredAgents.length > 0) {
          return {
            ...project,
            agents: projectNameMatches ? project.agents : filteredAgents,
          };
        }
        return null;
      })
      .filter(Boolean) as Project[];

    return { projects: filteredProjects, localAgents: filteredLocal };
  }, [projects, localAgents, searchQuery]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const totalAgents =
    filteredData.localAgents.length +
    filteredData.projects.reduce((sum, p) => sum + p.agents.length, 0);

  if (totalAgents === 0 && projects.length === 0 && localAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-5 text-[#888] text-center">
        <EmptyIcon />
        <p>No projects or agents</p>
      </div>
    );
  }

  if (totalAgents === 0 && searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-5 text-[#888] text-center">
        <SearchIcon />
        <p>No results for "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Local agents section (current project) */}
      {filteredData.localAgents.length > 0 && (
        <ProjectSection
          project={{
            id: '__local__',
            path: '',
            name: 'Local',
            agents: filteredData.localAgents,
          }}
          isExpanded={expandedProjects.has('__local__')}
          isCurrentProject={true}
          selectedAgent={selectedAgent}
          compact={compact}
          onToggle={() => toggleProject('__local__')}
          onAgentSelect={(agent) => onAgentSelect?.(agent)}
          onReleaseClick={onReleaseClick}
          onLogsClick={onLogsClick}
        />
      )}

      {/* Bridged projects */}
      {filteredData.projects.map((project) => (
        <ProjectSection
          key={project.id}
          project={project}
          isExpanded={expandedProjects.has(project.id)}
          isCurrentProject={project.id === currentProject}
          selectedAgent={selectedAgent}
          compact={compact}
          onToggle={() => toggleProject(project.id)}
          onProjectSelect={() => onProjectSelect?.(project)}
          onAgentSelect={(agent) => onAgentSelect?.(agent, project)}
          onReleaseClick={onReleaseClick}
          onLogsClick={onLogsClick}
        />
      ))}
    </div>
  );
}

interface ProjectSectionProps {
  project: Project;
  isExpanded: boolean;
  isCurrentProject: boolean;
  selectedAgent?: string;
  compact?: boolean;
  onToggle: () => void;
  onProjectSelect?: () => void;
  onAgentSelect?: (agent: Agent) => void;
  onReleaseClick?: (agent: Agent) => void;
  onLogsClick?: (agent: Agent) => void;
}

interface TeamGroup {
  name: string;
  agents: Agent[];
}

function ProjectSection({
  project,
  isExpanded,
  isCurrentProject,
  selectedAgent,
  compact,
  onToggle,
  onProjectSelect,
  onAgentSelect,
  onReleaseClick,
  onLogsClick,
}: ProjectSectionProps) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    let online = 0;
    let needsAttention = 0;
    for (const agent of project.agents) {
      if (agent.status === 'online') online++;
      if (agent.needsAttention) needsAttention++;
    }
    return { online, needsAttention, total: project.agents.length };
  }, [project.agents]);

  // Group agents by team (optional user-defined grouping)
  const { teams, ungroupedAgents } = useMemo(() => {
    const teamMap = new Map<string, Agent[]>();
    const ungrouped: Agent[] = [];

    for (const agent of project.agents) {
      if (agent.team) {
        const existing = teamMap.get(agent.team) || [];
        existing.push(agent);
        teamMap.set(agent.team, existing);
      } else {
        ungrouped.push(agent);
      }
    }

    const teams: TeamGroup[] = Array.from(teamMap.entries())
      .map(([name, agents]) => ({ name, agents }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { teams, ungroupedAgents: ungrouped };
  }, [project.agents]);

  const toggleTeam = (teamName: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        next.add(teamName);
      }
      return next;
    });
  };

  // Auto-expand teams when project expands
  useEffect(() => {
    if (isExpanded && expandedTeams.size === 0 && teams.length > 0) {
      setExpandedTeams(new Set(teams.map((t) => t.name)));
    }
  }, [isExpanded, teams, expandedTeams]);

  const projectColor = getAgentColor(project.name || project.id);
  const displayName = project.name || project.path.split('/').pop() || project.id;

  return (
    <div className="mb-1">
      <button
        className={`flex items-center gap-2 w-full py-2.5 px-3 bg-none border-none cursor-pointer text-[13px] text-left rounded-md transition-colors duration-200 relative text-[#e8e8e8] hover:bg-[var(--project-light)] ${
          isCurrentProject ? 'bg-[rgba(0,255,200,0.08)]' : ''
        }`}
        onClick={onToggle}
        onDoubleClick={onProjectSelect}
        style={{
          '--project-color': projectColor.primary,
          '--project-light': projectColor.light,
        } as React.CSSProperties}
      >
        <div
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-sm"
          style={{ background: projectColor.primary }}
        />
        <ChevronIcon expanded={isExpanded} />
        <FolderIcon color={projectColor.primary} />
        <span className="font-semibold text-[#e8e8e8] whitespace-nowrap overflow-hidden text-ellipsis">{displayName}</span>
        <span className="text-[#888] font-normal flex-shrink-0">({stats.total})</span>

        <div className="ml-auto flex gap-2 flex-shrink-0">
          {stats.online > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#666]">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.online }}
              />
              {stats.online}
            </span>
          )}
          {stats.needsAttention > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#666]">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.attention }}
              />
              {stats.needsAttention}
            </span>
          )}
        </div>

        {project.lead?.connected && (
          <span className="text-[#ffd700] text-xs ml-1" title={`Lead: ${project.lead.name}`}>
            ★
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="py-1 pl-5 flex flex-col gap-1">
          {/* Team groups (optional user-defined) */}
          {teams.map((team) => (
            <div key={team.name} className="mb-0.5">
              <button
                className="flex items-center gap-1.5 w-full py-1.5 px-2 bg-none border-none cursor-pointer text-xs text-left rounded transition-colors duration-200 text-[#b8b8b8] hover:bg-white/5"
                onClick={() => toggleTeam(team.name)}
              >
                <ChevronIcon expanded={expandedTeams.has(team.name)} />
                <TeamIcon />
                <span className="font-medium text-[#b8b8b8]">{team.name}</span>
                <span className="text-[#666] font-normal">({team.agents.length})</span>
              </button>
              {expandedTeams.has(team.name) && (
                <div className="py-0.5 pl-4 flex flex-col gap-1">
                  {team.agents.map((agent) => (
                    <AgentCard
                      key={agent.name}
                      agent={agent}
                      isSelected={agent.name === selectedAgent}
                      compact={compact}
                      displayNameOverride={stripTeamPrefix(agent.name, team.name)}
                      onClick={onAgentSelect}
                      onReleaseClick={onReleaseClick}
                      onLogsClick={onLogsClick}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Ungrouped agents (no team assigned) */}
          {ungroupedAgents.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              isSelected={agent.name === selectedAgent}
              compact={compact}
              onClick={onAgentSelect}
              onReleaseClick={onReleaseClick}
              onLogsClick={onLogsClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`transition-transform duration-200 text-[#888] flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FolderIcon({ color }: { color: string }) {
  return (
    <svg
      className="flex-shrink-0"
      style={{ color }}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg
      className="text-[#888] flex-shrink-0"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg
      className="mb-3 opacity-50"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="mb-3 opacity-50"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
