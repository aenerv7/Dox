import { render } from "preact";
import { App } from "./app";
import "./styles.css";

if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => false);
}

render(<App />, document.getElementById("app")!);
