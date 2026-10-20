const readerUrl = browser.runtime.getURL("index.html");

browser.action.onClicked.addListener(async () => {
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((tab) => tab.url?.startsWith(readerUrl));

  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined && browser.windows?.update) {
      await browser.windows.update(existing.windowId, { focused: true }).catch(() => undefined);
    }
    return;
  }

  await browser.tabs.create({ url: readerUrl });
});
