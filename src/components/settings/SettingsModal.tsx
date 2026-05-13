import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, Moon, Sun, Monitor, Database, FlaskConical, Key, Route } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { providers } from '@/lib/providers';
import { MODEL_PRESETS, OTHER_MODELS_PRESET_ID } from '@/lib/models/presets';
import { modelRegistry } from '@/lib/models/registry';
import { ModelPicker } from '@/components/models/ModelPicker';

interface SettingsModalProps {
  open: boolean;
}

export function SettingsModal({ open }: SettingsModalProps) {
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const autoScroll = useSettingsStore((s) => s.autoScroll);
  const setAutoScroll = useSettingsStore((s) => s.setAutoScroll);
  const showTimestamps = useSettingsStore((s) => s.showTimestamps);
  const setShowTimestamps = useSettingsStore((s) => s.setShowTimestamps);
  const persistConversations = useSettingsStore((s) => s.persistConversations);
  const setPersistConversations = useSettingsStore((s) => s.setPersistConversations);
  const experimentalFeatures = useSettingsStore((s) => s.experimentalFeatures);
  const toggleExperimentalFeature = useSettingsStore((s) => s.toggleExperimentalFeature);
  const providerSettings = useSettingsStore((s) => s.providerSettings);
  const setProviderSetting = useSettingsStore((s) => s.setProviderSetting);
  const selectedPreset = useSettingsStore((s) => s.selectedPreset);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedPreset = useSettingsStore((s) => s.setSelectedPreset);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const [advancedOpen, setAdvancedOpen] = useState(selectedPreset === OTHER_MODELS_PRESET_ID);
  const showAdvancedModels = advancedOpen || selectedPreset === OTHER_MODELS_PRESET_ID;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
          onClick={closeSettings}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="modal-panel w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-header flex items-center justify-between px-5 py-4 sm:px-6">
              <h2 className="text-xl font-semibold text-text-primary">Settings</h2>
              <button
                onClick={closeSettings}
                className="icon-action p-1.5 text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 sm:px-6 space-y-5 max-h-[76vh] overflow-y-auto">
              {/* Preset & Model */}
              <section>
                <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
                  <Route size={14} />
                  Model Routing
                </h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm text-text-muted mb-1.5 block">Preset</label>
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="control-surface w-full px-3 py-2.5 text-[0.95rem] text-text-primary outline-none"
                    >
                      {MODEL_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.emoji} {p.label} — {p.description}
                        </option>
                      ))}
                      <option value={OTHER_MODELS_PRESET_ID}>Other Models — advanced model browser</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-text-muted mb-1.5 block">
                      Advanced Override
                      {activeModelLabel(selectedModel) && (
                        <span className="ml-2 text-xs text-text-secondary">
                          {activeModelLabel(selectedModel)}
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen((value) => !value)}
                      className="control-surface w-full px-3 py-2.5 text-left text-[0.95rem] text-text-secondary"
                      aria-expanded={showAdvancedModels}
                    >
                      Other Models
                      <span className="float-right text-xs text-text-muted">
                        {showAdvancedModels ? 'Hide' : 'Browse'}
                      </span>
                    </button>
                    {showAdvancedModels && (
                      <div className="mt-2">
                        <ModelPicker selectedModel={selectedModel} onSelect={setSelectedModel} />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Theme */}
              <section>
                <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
                  <Monitor size={14} />
                  Appearance
                </h3>
                <div className="flex gap-2">
                  {[
                    { id: 'dark' as const, icon: Moon, label: 'Dark' },
                    { id: 'light' as const, icon: Sun, label: 'Light' },
                    { id: 'system' as const, icon: Monitor, label: 'System' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        theme === t.id
                          ? 'primary-action text-white'
                          : 'control-surface text-text-secondary'
                      }`}
                    >
                      <t.icon size={14} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Chat Preferences */}
              <section>
                <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
                  <Database size={14} />
                  Chat Preferences
                </h3>
                <div className="space-y-3">
                  <Toggle label="Auto-scroll to new messages" checked={autoScroll} onChange={setAutoScroll} />
                  <Toggle label="Show message timestamps" checked={showTimestamps} onChange={setShowTimestamps} />
                  <Toggle label="Persist conversations locally" checked={persistConversations} onChange={setPersistConversations} />
                  <Toggle
                    label="Enable fallback routing"
                    checked={experimentalFeatures.fallbackRouting}
                    onChange={() => toggleExperimentalFeature('fallbackRouting')}
                  />
                </div>
              </section>

              {/* Provider API Keys */}
              <section>
                <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
                  <Key size={14} />
                  Provider API Keys
                </h3>
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <div
                      key={provider.id}
                      className="control-surface flex items-center gap-2 px-3 py-2"
                    >
                      <span className="text-[0.94rem] text-text-secondary w-24">{provider.name}</span>
                      <input
                        type="password"
                        placeholder={provider.isEnabled ? 'Using mock mode' : 'Enter API key'}
                        value={providerSettings[provider.id]?.apiKey || ''}
                        onChange={(e) => setProviderSetting(provider.id, 'apiKey', e.target.value)}
                        className="flex-1 bg-transparent text-[0.94rem] text-text-primary placeholder:text-text-muted outline-none"
                      />
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          provider.isEnabled
                            ? 'bg-success/10 text-success'
                            : 'bg-text-muted/10 text-text-muted'
                        }`}
                      >
                        {provider.isEnabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Experimental */}
              <section>
                <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
                  <FlaskConical size={14} />
                  Experimental Features
                </h3>
                <div className="space-y-3">
                  {Object.entries(experimentalFeatures).map(([key, value]) => (
                    <Toggle
                      key={key}
                      label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                      checked={value}
                      onChange={() => toggleExperimentalFeature(key)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function activeModelLabel(modelId: string) {
  const model = modelRegistry.get(modelId);
  return model ? `${model.label} · ${model.provider}` : '';
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-[0.95rem] text-text-secondary group-hover:text-text-primary transition-colors">
        {label}
      </span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'toggle-track is-on' : 'toggle-track'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
