import { DEFAULT_SETTINGS, type AppSettings } from "./model";

const STORAGE_KEY = "doxReaderSettings";

function hasExtensionStorage(): boolean {
  return typeof browser !== "undefined" && Boolean(browser.storage?.local);
}

export async function loadSettings(): Promise<AppSettings> {
  if (hasExtensionStorage()) {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<AppSettings> | undefined) };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<AppSettings> } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (hasExtensionStorage()) {
    await browser.storage.local.set({ [STORAGE_KEY]: settings });
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applyTheme(theme: AppSettings["theme"]): void {
  document.documentElement.dataset.theme = theme;
}
