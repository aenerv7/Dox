// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./model";
import { applyAppearance, loadSettings, saveSettings } from "./settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-scheme");
  document.documentElement.removeAttribute("data-theme");
});

describe("default appearance", () => {
  it("uses Material 3 with system theme for a new library", async () => {
    const settings = await loadSettings();
    expect(settings.colorScheme).toBe("material");
    expect(settings.theme).toBe("system");
    applyAppearance(settings);
    expect(document.documentElement.dataset.scheme).toBe("material");
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  it("defaults to 24-hour refresh and preserves off or custom intervals", async () => {
    expect((await loadSettings()).autoRefreshHours).toBe(24);
    for (const hours of [0, 1, 72]) {
      await saveSettings({ ...DEFAULT_SETTINGS, autoRefreshHours: hours });
      expect((await loadSettings()).autoRefreshHours).toBe(hours);
    }
    for (const hours of [-1, 0.5, '24', null]) {
      localStorage.setItem('doxReaderSettings', JSON.stringify({ autoRefreshHours: hours }));
      expect((await loadSettings()).autoRefreshHours).toBe(24);
    }
  });

  it("fills missing appearance settings without overwriting saved preferences", async () => {
    localStorage.setItem("doxReaderSettings", JSON.stringify({ webdavUrl: "https://dav.example/" }));
    expect((await loadSettings()).colorScheme).toBe("material");
    await saveSettings({ ...DEFAULT_SETTINGS, colorScheme: "ink", theme: "dark" });
    expect(await loadSettings()).toMatchObject({ colorScheme: "ink", theme: "dark" });
  });
});
