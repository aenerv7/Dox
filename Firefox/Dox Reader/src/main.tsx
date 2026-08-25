import { render } from "preact";
import { App } from "./app";
import { isExtensionRuntime } from "./runtime-fetch";
import "./styles.css";

if (!isExtensionRuntime() && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => false);
}

render(<App />, document.getElementById("app")!);
