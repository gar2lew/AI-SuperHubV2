export interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  createdAt: number;
  status: 'success' | 'error';
}

export interface TerminalAdapter {
  execute(command: string): Promise<TerminalEntry>;
}

export class MockTerminalAdapter implements TerminalAdapter {
  async execute(command: string): Promise<TerminalEntry> {
    const trimmed = command.trim();
    const output = trimmed
      ? `mock> ${trimmed}\nExecution adapter is UI-only. Shell access is intentionally disabled.`
      : 'No command entered.';

    return {
      id: `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      command: trimmed,
      output,
      createdAt: Date.now(),
      status: 'success',
    };
  }
}

export const terminalAdapter: TerminalAdapter = new MockTerminalAdapter();
