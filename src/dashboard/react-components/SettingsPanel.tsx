/**
 * SettingsPanel Component
 *
 * Dashboard settings and preferences panel with
 * appearance, notifications, and connection options.
 */

import React, { useState, useCallback } from 'react';

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    mentionsOnly: boolean;
  };
  display: {
    compactMode: boolean;
    showTimestamps: boolean;
    showAvatars: boolean;
    animationsEnabled: boolean;
  };
  connection: {
    autoReconnect: boolean;
    reconnectDelay: number;
    keepAliveInterval: number;
  };
}

export const defaultSettings: Settings = {
  theme: 'system',
  notifications: {
    enabled: true,
    sound: true,
    desktop: false,
    mentionsOnly: false,
  },
  display: {
    compactMode: false,
    showTimestamps: true,
    showAvatars: true,
    animationsEnabled: true,
  },
  connection: {
    autoReconnect: true,
    reconnectDelay: 3000,
    keepAliveInterval: 30000,
  },
};

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onResetSettings?: () => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onResetSettings,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'notifications' | 'connection'>('appearance');

  const updateSetting = useCallback(
    (
      category: 'notifications' | 'display' | 'connection',
      key: string,
      value: boolean | number
    ) => {
      const categorySettings = settings[category];
      onSettingsChange({
        ...settings,
        [category]: {
          ...categorySettings,
          [key]: value,
        },
      });
    },
    [settings, onSettingsChange]
  );

  const updateTheme = useCallback(
    (theme: Settings['theme']) => {
      onSettingsChange({ ...settings, theme });
    },
    [settings, onSettingsChange]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-secondary)] rounded-xl w-[500px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-[0_16px_70px_rgba(0,0,0,0.5)] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between py-5 px-6 border-b border-[var(--color-border)]">
          <h2 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">Settings</h2>
          <button
            className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-md text-[var(--color-text-secondary)] cursor-pointer transition-all duration-150 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex gap-1 py-3 px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <button
            className={`flex items-center gap-1.5 py-2 px-3.5 bg-transparent border-none rounded-md text-[13px] cursor-pointer font-[inherit] transition-all duration-150 ${
              activeTab === 'appearance'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            onClick={() => setActiveTab('appearance')}
          >
            <PaletteIcon />
            Appearance
          </button>
          <button
            className={`flex items-center gap-1.5 py-2 px-3.5 bg-transparent border-none rounded-md text-[13px] cursor-pointer font-[inherit] transition-all duration-150 ${
              activeTab === 'notifications'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            onClick={() => setActiveTab('notifications')}
          >
            <BellIcon />
            Notifications
          </button>
          <button
            className={`flex items-center gap-1.5 py-2 px-3.5 bg-transparent border-none rounded-md text-[13px] cursor-pointer font-[inherit] transition-all duration-150 ${
              activeTab === 'connection'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            onClick={() => setActiveTab('connection')}
          >
            <WifiIcon />
            Connection
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'appearance' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.5px]">Theme</label>
                <div className="flex gap-2">
                  {(['light', 'dark', 'system'] as const).map((theme) => (
                    <button
                      key={theme}
                      className={`flex flex-col items-center gap-1.5 py-4 px-5 border-2 rounded-lg text-xs cursor-pointer font-[inherit] transition-all duration-150 flex-1 ${
                        settings.theme === theme
                          ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]'
                          : 'bg-[var(--color-bg-hover)] border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)]'
                      }`}
                      onClick={() => updateTheme(theme)}
                    >
                      {theme === 'light' && <SunIcon />}
                      {theme === 'dark' && <MoonIcon />}
                      {theme === 'system' && <MonitorIcon />}
                      <span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.5px]">Display Options</label>
                <ToggleOption
                  label="Compact mode"
                  description="Show more content in less space"
                  checked={settings.display.compactMode}
                  onChange={(v) => updateSetting('display', 'compactMode', v)}
                />
                <ToggleOption
                  label="Show timestamps"
                  description="Display time for each message"
                  checked={settings.display.showTimestamps}
                  onChange={(v) => updateSetting('display', 'showTimestamps', v)}
                />
                <ToggleOption
                  label="Show avatars"
                  description="Display agent avatars in messages"
                  checked={settings.display.showAvatars}
                  onChange={(v) => updateSetting('display', 'showAvatars', v)}
                />
                <ToggleOption
                  label="Enable animations"
                  description="Smooth transitions and effects"
                  checked={settings.display.animationsEnabled}
                  onChange={(v) => updateSetting('display', 'animationsEnabled', v)}
                />
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.5px]">Notification Preferences</label>
                <ToggleOption
                  label="Enable notifications"
                  description="Receive alerts for new messages"
                  checked={settings.notifications.enabled}
                  onChange={(v) => updateSetting('notifications', 'enabled', v)}
                />
                <ToggleOption
                  label="Sound alerts"
                  description="Play sound for new messages"
                  checked={settings.notifications.sound}
                  onChange={(v) => updateSetting('notifications', 'sound', v)}
                  disabled={!settings.notifications.enabled}
                />
                <ToggleOption
                  label="Desktop notifications"
                  description="Show system notifications"
                  checked={settings.notifications.desktop}
                  onChange={(v) => updateSetting('notifications', 'desktop', v)}
                  disabled={!settings.notifications.enabled}
                />
                <ToggleOption
                  label="Mentions only"
                  description="Only notify when mentioned"
                  checked={settings.notifications.mentionsOnly}
                  onChange={(v) => updateSetting('notifications', 'mentionsOnly', v)}
                  disabled={!settings.notifications.enabled}
                />
              </div>
            </div>
          )}

          {activeTab === 'connection' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.5px]">Connection Settings</label>
                <ToggleOption
                  label="Auto-reconnect"
                  description="Automatically reconnect on disconnect"
                  checked={settings.connection.autoReconnect}
                  onChange={(v) => updateSetting('connection', 'autoReconnect', v)}
                />

                <div className="flex flex-col gap-1.5 p-3 bg-[var(--color-bg-hover)] rounded-lg">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Reconnect delay (ms)</label>
                  <input
                    type="number"
                    className="py-2 px-3 border border-[var(--color-border)] rounded-md text-sm font-[inherit] outline-none transition-colors duration-150 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] disabled:bg-[var(--color-bg-hover)] disabled:text-[var(--color-text-muted)]"
                    value={settings.connection.reconnectDelay}
                    onChange={(e) =>
                      updateSetting('connection', 'reconnectDelay', parseInt(e.target.value) || 3000)
                    }
                    min={1000}
                    max={30000}
                    step={1000}
                    disabled={!settings.connection.autoReconnect}
                  />
                </div>

                <div className="flex flex-col gap-1.5 p-3 bg-[var(--color-bg-hover)] rounded-lg">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Keep-alive interval (ms)</label>
                  <input
                    type="number"
                    className="py-2 px-3 border border-[var(--color-border)] rounded-md text-sm font-[inherit] outline-none transition-colors duration-150 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] disabled:bg-[var(--color-bg-hover)] disabled:text-[var(--color-text-muted)]"
                    value={settings.connection.keepAliveInterval}
                    onChange={(e) =>
                      updateSetting('connection', 'keepAliveInterval', parseInt(e.target.value) || 30000)
                    }
                    min={5000}
                    max={120000}
                    step={5000}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between py-4 px-6 border-t border-[var(--color-border)]">
          {onResetSettings && (
            <button
              className="py-2 px-4 bg-transparent border border-[var(--color-border)] rounded-md text-[13px] text-[var(--color-text-secondary)] cursor-pointer font-[inherit] transition-all duration-150 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              onClick={onResetSettings}
            >
              Reset to defaults
            </button>
          )}
          <button
            className="py-2 px-5 bg-[var(--color-accent)] border-none rounded-md text-[13px] font-medium text-white cursor-pointer font-[inherit] transition-colors duration-150 hover:bg-[var(--color-accent-hover)]"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToggleOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleOption({ label, description, checked, onChange, disabled }: ToggleOptionProps) {
  return (
    <div className={`flex items-center justify-between p-3 bg-[var(--color-bg-hover)] rounded-lg ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{description}</span>
      </div>
      <button
        className={`w-11 h-6 border-none rounded-xl cursor-pointer relative transition-colors duration-200 ${
          checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-dark)]'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.2)] ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}

// Icon components
function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="13.5" cy="6.5" r=".5" />
      <circle cx="17.5" cy="10.5" r=".5" />
      <circle cx="8.5" cy="7.5" r=".5" />
      <circle cx="6.5" cy="12.5" r=".5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}
