import type { ToolDefinition } from '@/types';

// Tool Registry — placeholder architecture for future tool system
// Tools will be registered here and made available to AI providers

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  unregister(id: string): void {
    this.tools.delete(id);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getAvailableForProvider(_providerId: string): ToolDefinition[] {
    // Future: filter by provider capability
    return this.getAll();
  }
}

export const toolRegistry = new ToolRegistry();

// Placeholder tool definitions for future implementation
export const placeholderTools: ToolDefinition[] = [
  {
    id: 'filesystem.read',
    name: 'Read File',
    description: 'Read the contents of a file',
    parameters: { path: { type: 'string', description: 'File path' } },
  },
  {
    id: 'filesystem.write',
    name: 'Write File',
    description: 'Write content to a file',
    parameters: { path: { type: 'string' }, content: { type: 'string' } },
  },
  {
    id: 'browser.search',
    name: 'Web Search',
    description: 'Search the web for information',
    parameters: { query: { type: 'string' } },
  },
  {
    id: 'code.execute',
    name: 'Execute Code',
    description: 'Execute code in a sandboxed environment',
    parameters: { language: { type: 'string' }, code: { type: 'string' } },
  },
];

placeholderTools.forEach((t) => toolRegistry.register(t));
