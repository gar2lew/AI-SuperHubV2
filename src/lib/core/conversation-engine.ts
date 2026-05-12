// Re-exports from the new context directory for backward compatibility.
// New code should import from @/lib/core/context directly.
export {
  assembleContext,
  assembleTextContext,
  stripToText,
  pruneContext,
  needsPruning,
  estimateTokens,
  estimateStringTokens,
  formatForPuter,
  extractSystemPrompt,
  formatForOpenAI,
} from './context';
