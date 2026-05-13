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
import { MODEL_PRESETS, OTHER_MODELS_PRESET_ID, getPreset } from '@/lib/models/presets';
import { ModelPicker } from '@/components/models/ModelPicker';

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const openSearch = useSettingsStore((s) => s.openSearch);
  const selectedPreset = useSettingsStore((s) => s.selectedPreset);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);
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
  const presetLabel = selectedPreset === OTHER_MODELS_PRESET_ID ? 'Other Models' : activePreset?.label;
  const presetEmoji = selectedPreset === OTHER_MODELS_PRESET_ID ? '⋯' : activePreset?.emoji;

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 296 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="sidebar-shell flex flex-col border-r shrink-0"
    >
      {/* Header */}
      <div className="sidebar-section flex items-center gap-2 p-3.5 border-b">
        <button
          onClick={() => {
            createConversation();
            setActiveWorkspace('chat');
          }}
          className="primary-action flex-1"
          title="New Chat"
        >
          <MessageSquarePlus size={16} />
          {!sidebarCollapsed && <span>New Chat</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="icon-action"
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
                  className={`sidebar-item group flex items-center gap-2 px-3 py-2.5 cursor-pointer ${
                    conv.id === activeConversationId
                      ? 'is-active text-text-primary'
                      : 'text-text-secondary'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.94rem] font-medium truncate">{truncate(conv.title, 30)}</p>
                    <p className="text-xs leading-5 text-text-muted">{formatDate(conv.updatedAt)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="icon-action opacity-0 group-hover:opacity-100 text-text-muted hover:text-error"
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
        <div className="sidebar-section px-3 py-3 border-t space-y-2.5">
          {/* Preset */}
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="control-surface w-full flex items-center gap-2 px-3 py-2.5 text-[0.9rem] text-text-secondary"
            >
              <span className="text-base">{presetEmoji}</span>
              <span className="flex-1 text-left">{presetLabel || 'Select Preset'}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            <AnimatePresence>
              {showPresetMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="floating-panel absolute bottom-full left-0 right-0 mb-1 overflow-hidden z-50"
                >
                  {MODEL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPreset(p.id);
                        setShowPresetMenu(false);
                      }}
                      className={`command-item w-full text-left px-3 py-2 text-sm ${
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
                  <button
                    onClick={() => {
                      setShowPresetMenu(false);
                      setShowModelMenu(true);
                    }}
                    className={`command-item w-full text-left px-3 py-2 text-sm ${
                      selectedPreset === OTHER_MODELS_PRESET_ID ? 'text-accent' : 'text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>⋯</span>
                      <span className="font-medium">Other Models</span>
                    </div>
                    <div className="text-xs text-text-muted pl-6">Search the broader Puter model ecosystem</div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Model */}
          <div className="relative">
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="control-surface w-full flex items-center gap-2 px-3 py-2.5 text-[0.9rem] text-text-secondary"
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
                  className="floating-panel absolute bottom-full left-0 right-0 mb-1 overflow-hidden z-50 max-h-48 overflow-y-auto"
                >
                  <div className="p-2">
                    <ModelPicker
                      selectedModel={selectedModel}
                      compact
                      onSelect={(modelId) => {
                        setSelectedModel(modelId);
                        setShowModelMenu(false);
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="sidebar-section flex items-center gap-1 p-2 border-t">
        <button
          onClick={openSearch}
          className="icon-action flex-1 flex items-center justify-center gap-2 p-2 text-text-muted hover:text-text-primary"
          title="Search"
        >
          <Search size={16} />
        </button>
        <button
          onClick={toggleRightPanel}
          className="icon-action flex-1 flex items-center justify-center gap-2 p-2 text-text-muted hover:text-text-primary"
          title="Toggle Right Panel"
        >
          <PanelRight size={16} />
        </button>
        <button
          onClick={openSettings}
          className="icon-action flex-1 flex items-center justify-center gap-2 p-2 text-text-muted hover:text-text-primary"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </motion.aside>
  );
}
