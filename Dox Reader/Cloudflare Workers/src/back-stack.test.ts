// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { BackLayer, useBackLayer } from "./back-stack";

const SETTLE_MS = 20;

let root: HTMLDivElement;

function Layers(props: { open: readonly boolean[]; onBack: (index: number) => void }) {
  return h("div", {}, props.open.map((open, index) => h(LayerProbe, { key: index, open, onBack: () => props.onBack(index) })));
}

function LayerProbe(props: { open: boolean; onBack: () => void }) {
  useBackLayer(props.open ? BackLayer.Open : BackLayer.Closed, props.onBack);
  return null;
}

// History traversals and effects are asynchronous.
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, SETTLE_MS)); });
}

async function show(open: readonly boolean[], onBack: (index: number) => void) {
  await act(async () => { render(h(Layers, { open, onBack }), root); });
  await settle();
}

function depth(): number {
  return (history.state as { doxBackDepth?: number } | null)?.doxBackDepth ?? 0;
}

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(async () => {
  render(null, root);
  root.remove();
  await settle();
});

describe("back stack", () => {
  it("closes an open layer on back", async () => {
    const open = [true];
    const onBack = vi.fn((index: number) => { open[index] = false; });
    await show(open, onBack);
    expect(depth()).toBe(1);

    history.back();
    await settle();

    expect(onBack).toHaveBeenCalledExactlyOnceWith(0);
    expect(depth()).toBe(0);
  });

  it("drops the history entry when the layer closes from the UI", async () => {
    const onBack = vi.fn();
    await show([true], onBack);

    await show([false], onBack);

    expect(depth()).toBe(0);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("closes only the top layer per back press", async () => {
    const open = [true, false];
    const onBack = vi.fn((index: number) => { open[index] = false; });
    await show(open, onBack);
    open[1] = true;
    await show(open, onBack);
    expect(depth()).toBe(2);

    history.back();
    await settle();
    await show(open, onBack);

    expect(onBack).toHaveBeenCalledExactlyOnceWith(1);
    expect(depth()).toBe(1);
  });

  it("steps back out of a forward entry whose layer is gone", async () => {
    const onBack = vi.fn();
    await show([true], onBack);
    await show([false], onBack);

    history.forward();
    await settle();

    expect(depth()).toBe(0);
    expect(onBack).not.toHaveBeenCalled();
  });
});
