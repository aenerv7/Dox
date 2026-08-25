import { DEFAULT_SETTINGS, type AppSettings } from "./model";

const STORAGE_KEY = "doxReaderSettings";

export async function loadSettings(): Promise<AppSettings> {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<AppSettings> } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function accentContrast(hex: string): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.36 ? "#171717" : "#ffffff";
}

export function applyAppearance(
  appearance: Pick<AppSettings, "theme" | "colorScheme" | "customAccent">,
): void {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.scheme = appearance.colorScheme;
  if (/^#[0-9a-f]{6}$/i.test(appearance.customAccent)) {
    root.style.setProperty("--accent", appearance.customAccent);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${appearance.customAccent} 18%, var(--surface))`);
    root.style.setProperty("--accent-contrast", accentContrast(appearance.customAccent));
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-soft");
    root.style.removeProperty("--accent-contrast");
  }
}
