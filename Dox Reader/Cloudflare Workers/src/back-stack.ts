// Mirrors open UI layers (mobile pane, dialogs) onto browser history, so the
// Android back key or gesture closes the top layer instead of leaving the app.
//
//   history:  [app] --> [depth 1] --> [depth 2]
//   layers:             reader pane   settings dialog
//
// Opening a layer pushes an entry. Closing it from the UI steps back.
// A back press lands on a shallower entry and closes every layer above it.

import { useEffect, useRef } from "preact/hooks";

const DEPTH_KEY = "doxBackDepth";

export enum BackLayer { Closed, Open }

interface Layer {
  close: () => void;
}

// Open layers, bottom to top.
const layers: Layer[] = [];

// Depth of the current history entry once pending traversals settle.
let historyDepth = 0;
let listening = false;

function depthOf(state: unknown): number {
  const depth = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof depth === "number" ? depth : 0;
}

// Make history as deep as the layer stack.
function syncHistory() {
  const delta = layers.length - historyDepth;
  if (delta === 0) { return; }

  if (delta < 0) {
    history.go(delta);
  }

  for (let depth = historyDepth + 1; depth <= layers.length; depth += 1) {
    history.pushState({ [DEPTH_KEY]: depth }, "");
  }

  historyDepth = layers.length;
}

function handlePopState(event: PopStateEvent) {
  historyDepth = depthOf(event.state);

  // Back: close the layers above the entry we landed on.
  while (layers.length > historyDepth) {
    layers.pop()!.close();
  }

  // Forward into an entry whose layer is gone: step back out.
  syncHistory();
}

// Start tracking. A reload keeps the entries of layers that no longer exist;
// unwind them so the first back press is not wasted.
export function initBackStack() {
  if (listening) { return; }

  listening = true;
  historyDepth = depthOf(history.state);
  window.addEventListener("popstate", handlePopState);
  syncHistory();
}

function openLayer(layer: Layer) {
  initBackStack();
  layers.push(layer);
  syncHistory();
}

function closeLayer(layer: Layer) {
  const index = layers.indexOf(layer);

  // Already closed by a back press.
  if (index < 0) { return; }

  layers.splice(index, 1);
  syncHistory();
}

// While open, one back press calls onBack, which must close the layer.
export function useBackLayer(state: BackLayer, onBack: () => void) {
  const callback = useRef(onBack);
  callback.current = onBack;

  useEffect(() => {
    if (state === BackLayer.Closed) { return; }

    const layer: Layer = { close: () => callback.current() };
    openLayer(layer);
    return () => closeLayer(layer);
  }, [state]);
}
