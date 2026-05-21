import type { RuntimeToolDefinition } from './runtime';
import { realtimeToolDefinitions } from './builtin-tools';

// Tool Registry — centralized deterministic tool definitions.

class ToolRegistry {
  private tools = new Map<string, RuntimeToolDefinition>();

  register(tool: RuntimeToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  unregister(id: string): void {
    this.tools.delete(id);
  }

  get(id: string): RuntimeToolDefinition | undefined {
    return this.tools.get(id);
  }

  getAll(): RuntimeToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getAvailableForProvider(_providerId: string): RuntimeToolDefinition[] {
    return this.getAll();
  }
}

export const toolRegistry = new ToolRegistry();

realtimeToolDefinitions.forEach((tool) => toolRegistry.register(tool));
