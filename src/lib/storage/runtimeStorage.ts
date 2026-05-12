export interface RuntimeStorage {
  getItem<T>(key: string, fallback: T): Promise<T>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class LocalRuntimeStorage implements RuntimeStorage {
  async getItem<T>(key: string, fallback: T): Promise<T> {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}

export const runtimeStorage: RuntimeStorage = new LocalRuntimeStorage();

export const storageStrategy = {
  current: 'localStorage',
  next: 'IndexedDB',
  notes:
    'Artifacts and attachments now have a storage boundary. The adapter keeps localStorage behavior while leaving room for IndexedDB-backed blobs later.',
};
