const STORAGE_KEY = 'ai-workstation-data';

export function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}-${key}`, JSON.stringify(data));
  } catch {
    // Silently fail if storage is full
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${key}`);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function removeFromStorage(key: string): void {
  localStorage.removeItem(`${STORAGE_KEY}-${key}`);
}
