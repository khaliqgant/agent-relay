/**
 * Dashboard V2 React Components
 *
 * This module requires React to be installed.
 * Components now use Tailwind CSS for styling.
 * Install with: npm install react react-dom
 */

// Core Components
export { AgentCard, type AgentCardProps } from './AgentCard';
export { AgentList, type AgentListProps } from './AgentList';
export { ThinkingIndicator, ThinkingDot, type ThinkingIndicatorProps } from './ThinkingIndicator';
export { MessageList, type MessageListProps } from './MessageList';
export { CommandPalette, type CommandPaletteProps, type Command } from './CommandPalette';
export { SpawnModal, type SpawnModalProps, type SpawnConfig } from './SpawnModal';
export { TrajectoryViewer, type TrajectoryViewerProps, type TrajectoryStep } from './TrajectoryViewer';
export { DecisionQueue, type DecisionQueueProps, type Decision } from './DecisionQueue';
export { ServerCard, type ServerCardProps, type ServerInfo } from './ServerCard';
export { FleetOverview, type FleetOverviewProps } from './FleetOverview';
export { BroadcastComposer, type BroadcastComposerProps, type BroadcastTarget } from './BroadcastComposer';
export { SettingsPanel, defaultSettings, type SettingsPanelProps, type Settings } from './SettingsPanel';
export { NotificationToast, useToasts, type NotificationToastProps, type Toast } from './NotificationToast';
export { ThemeProvider, ThemeToggle, useTheme, type ThemeProviderProps, type Theme, type ResolvedTheme } from './ThemeProvider';
export { App, type AppProps } from './App';
export { MentionAutocomplete, useMentionAutocomplete, getMentionQuery, completeMentionInValue, type MentionAutocompleteProps } from './MentionAutocomplete';
export { ProjectList, type ProjectListProps } from './ProjectList';

// Layout Components
export { Sidebar, type SidebarProps } from './layout/Sidebar';
export { Header, type HeaderProps } from './layout/Header';

// Hooks
export {
  useWebSocket,
  useAgents,
  useMessages,
  type UseWebSocketOptions,
  type UseWebSocketReturn,
  type UseAgentsOptions,
  type UseAgentsReturn,
  type UseMessagesOptions,
  type UseMessagesReturn,
  type DashboardData,
  type AgentWithColor,
} from './hooks';
