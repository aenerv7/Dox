"use strict";

/* global BookmarkSorter */

const TARGET_ROOT_IDS = Object.freeze([
  "menu________", // Bookmarks Menu
  "unfiled_____", // Other Bookmarks
]);

const SORT_ALARM_NAME = "auto-sort-bookmarks";
const SORT_DELAY_MS = 1500;
const RETRY_DELAY_MS = 15000;
const SESSION_DEFAULTS = Object.freeze({
  pendingSort: false,
});

let activeSort = null;

function reportError(context, error) {
  console.error(`[Auto Sort Bookmarks] ${context}`, error);
}

function createSortAlarm(delayMs) {
  browser.alarms.create(SORT_ALARM_NAME, {
    when: Date.now() + delayMs,
  });
}

async function getSessionState() {
  const state = await browser.storage.session.get(SESSION_DEFAULTS);
  return { ...SESSION_DEFAULTS, ...state };
}

async function requestSort(reason, delayMs = SORT_DELAY_MS) {
  await browser.storage.session.set({
    pendingReason: reason,
    pendingSort: true,
  });
  createSortAlarm(delayMs);
}

async function armPendingSort(delayMs = SORT_DELAY_MS) {
  const state = await getSessionState();
  if (state.pendingSort) {
    createSortAlarm(delayMs);
  }
}

async function hasFocusedBrowserWindow() {
  const windows = await browser.windows.getAll({
    windowTypes: ["normal"],
  });

  return windows.some(windowInfo => windowInfo.focused);
}

async function runPendingSort() {
  if (activeSort) {
    return activeSort;
  }

  let completedSort = false;

  activeSort = (async () => {
    const state = await getSessionState();

    if (!state.pendingSort) {
      return;
    }

    // A focused Library window makes every normal browser window report
    // focused=false, so sorting is deferred until a normal window is active.
    if (!(await hasFocusedBrowserWindow())) {
      return;
    }

    // Clear first. Bookmark move events raised by this pass set it again and
    // cause one harmless, idempotent verification pass after the debounce.
    await browser.storage.session.set({
      pendingReason: null,
      pendingSort: false,
    });

    try {
      const result = await BookmarkSorter.sortRoots(
        browser.bookmarks,
        TARGET_ROOT_IDS,
      );
      console.info(
        `[Auto Sort Bookmarks] Sorted ${result.folderCount} folders with ${result.moveCount} moves.`,
      );
      completedSort = true;
    } catch (error) {
      await browser.storage.session.set({ pendingSort: true });
      createSortAlarm(RETRY_DELAY_MS);
      throw error;
    }
  })();

  try {
    await activeSort;
  } finally {
    activeSort = null;
    if (completedSort) {
      await armPendingSort();
    }
  }
}

function safely(promise, context) {
  promise.catch(error => reportError(context, error));
}

function scheduleForBookmarkEvent(eventName) {
  safely(requestSort(eventName), `Could not schedule ${eventName}`);
}

// Event listeners are registered synchronously so Firefox can wake the MV3
// event page for them after the background context has gone idle.
browser.bookmarks.onCreated.addListener(() => {
  scheduleForBookmarkEvent("bookmark-created");
});

browser.bookmarks.onChanged.addListener(() => {
  scheduleForBookmarkEvent("bookmark-changed");
});

browser.bookmarks.onMoved.addListener(() => {
  scheduleForBookmarkEvent("bookmark-moved");
});

browser.bookmarks.onRemoved.addListener(() => {
  scheduleForBookmarkEvent("bookmark-removed");
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SORT_ALARM_NAME) {
    safely(runPendingSort(), "Sort failed");
  }
});

browser.windows.onFocusChanged.addListener(() => {
  safely(armPendingSort(), "Could not resume after focus change");
});

browser.windows.onCreated.addListener(() => {
  safely(armPendingSort(), "Could not resume after window creation");
});

browser.runtime.onInstalled.addListener(() => {
  safely(requestSort("extension-installed"), "Initial sort could not be scheduled");
});

browser.runtime.onStartup.addListener(() => {
  safely(requestSort("browser-startup"), "Startup sort could not be scheduled");
});
