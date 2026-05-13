import { useMemo, useState } from 'react';
import { Check, Search, Sparkles } from 'lucide-react';
import type { AIModel, ModelProviderCategory } from '@/types';
import { CAPABILITY_LABELS } from '@/lib/models/capabilities';
import { getModelCategoryLabel, getModelMetadata } from '@/lib/models/metadata';
import { modelRegistry } from '@/lib/models/registry';

interface ModelPickerProps {
  selectedModel: string;
  onSelect: (modelId: string) => void;
  compact?: boolean;
}

const CATEGORY_ORDER: ModelProviderCategory[] = [
  'puter',
  'openai',
  'anthropic',
  'openrouter',
  'local',
  'specialized',
];

const VISIBLE_CAPABILITIES = ['chat', 'vision', 'image', 'coding', 'reasoning', 'tts', 'stt'] as const;

export function ModelPicker({ selectedModel, onSelect, compact = false }: ModelPickerProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const groupedModels = useMemo(() => {
    const models = modelRegistry.getAll();
    const filtered = normalizedQuery
      ? models.filter((model) => {
          const metadata = getModelMetadata(model);
          const haystack = [
            model.label,
            model.id,
            metadata.providerName,
            metadata.providerBadge,
            model.tier,
            ...(model.tags ?? []),
            ...(model.specializations ?? []),
            ...model.capabilities,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : models;

    return CATEGORY_ORDER.map((category) => ({
      category,
      models: filtered.filter((model) => getModelMetadata(model).category === category),
    })).filter((group) => group.models.length > 0);
  }, [normalizedQuery]);

  return (
    <div className="space-y-2">
      <label className="control-surface flex items-center gap-2 px-2.5 py-2">
        <Search size={14} className="text-text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models, providers, capabilities..."
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          aria-label="Search models"
        />
      </label>

      <div className={compact ? 'max-h-72 overflow-y-auto pr-1' : 'max-h-80 overflow-y-auto pr-1'}>
        {groupedModels.length === 0 ? (
          <div className="empty-workspace py-5 text-sm">
            <Sparkles size={18} />
            <span>No models match that search</span>
          </div>
        ) : (
          groupedModels.map((group) => (
            <div key={group.category} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {getModelCategoryLabel(group.category)}
              </div>
              <div className="space-y-1">
                {group.models.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    selected={model.id === selectedModel}
                    onSelect={() => onSelect(model.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModelOption({
  model,
  selected,
  onSelect,
}: {
  model: AIModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const metadata = getModelMetadata(model);
  const capabilities = VISIBLE_CAPABILITIES.filter((capability) =>
    metadata.capabilities.includes(capability)
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`command-item w-full text-left px-3 py-2.5 text-sm ${
        selected ? 'text-accent' : 'text-text-secondary'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-text-primary">{model.label}</span>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              {metadata.providerBadge}
            </span>
            {metadata.advanced && (
              <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-text-muted">
                Other
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full border border-border/50 bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted"
              >
                {CAPABILITY_LABELS[capability]}
              </span>
            ))}
          </div>
        </div>
        {selected && <Check size={14} className="mt-1 shrink-0 text-accent" />}
      </div>
    </button>
  );
}
