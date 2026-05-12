import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  Settings,
  Search,
  PanelRight,
  Sparkles,
} from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate, truncate } from '@/lib/utils';
import { modelRegistry } from '@/lib/models/registry';
import { MODEL_PRESETS, getPreset } from '@/lib/models/presets';

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const openSearch = useSettingsStore((s) => s.openSearch);
  const selectedPreset = useSettingsStore((s) => s.selectedPreset);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedPreset = useSettingsStore((s) => s.setSelectedPreset);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);

  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const activePreset = getPreset(selectedPreset);
  const activeModel = modelRegistry.get(selectedModel);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex flex-col border-r border-border-subtle bg-bg-secondary shrink-0"
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border-subtle">
        <button
          onClick={() => createConversation()}
          className="flex items-center gap-2 flex-1 justify-center px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          title="New Chat"
        >
          <MessageSquarePlus size={16} />
          {!sidebarCollapsed && <span>New Chat</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto py-2">
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-2 space-y-1"
            >
              {conversations.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Sparkles size={24} className="mx-auto mb-3 text-accent opacity-60" />
                  <p className="text-text-muted text-sm">No conversations yet</p>
                  <p className="text-text-muted text-xs mt-1">Start a new chat to begin</p>
                </div>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversation(conv.id)}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    conv.id === activeConversationId
                      ? 'bg-accent-subtle text-text-primary'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{truncate(conv.title, 28)}</p>
                    <p className="text-xs text-text-muted">{formatDate(conv.updatedAt)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-error transition-all"
                  >
                    ×
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preset & Model Selectors */}
      {!sidebarCollapsed && (
        <div className="px-3 py-2 border-t border-border-subtle space-y-2">
          {/* Preset */}
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary text-sm text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <span className="text-base">{activePreset?.emoji}</span>
              <span className="flex-1 text-left">{activePreset?.label || 'Select Preset'}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            <AnimatePresence>
              {showPresetMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute bottom-full left-0 right-0 mb-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden z-50"
                >
                  {MODEL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPreset(p.id);
                        setShowPresetMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-hover transition-colors ${
                        p.id === selectedPreset ? 'text-accent' : 'text-text-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{p.emoji}</span>
                        <span className="font-medium">{p.label}</span>
                      </div>
                      <div className="text-xs text-text-muted pl-6">{p.description}</div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Model */}
          <div className="relative">
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary text-sm text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <span className="flex-1 text-left">{activeModel?.label || 'Select Model'}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            <AnimatePresence>
              {showModelMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute bottom-full left-0 right-0 mb-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto"
                >
                  {modelRegistry.getAll().map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setShowModelMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-hover transition-colors ${
                        m.id === selectedModel ? 'text-accent' : 'text-text-secondary'
                      }`}
                    >
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs text-text-muted">
                        {m.provider} · {m.tier}
                        {m.multimodal && ' · multimodal'}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1 p-2 border-t border-border-subtle">
        <button
          onClick={openSearch}
          className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Search"
        >
          <Search size={16} />
        </button>
        <button
          onClick={toggleRightPanel}
          className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Toggle Right Panel"
        >
          <PanelRight size={16} />
        </button>
        <button
          onClick={openSettings}
          className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </motion.aside>
  );
}
