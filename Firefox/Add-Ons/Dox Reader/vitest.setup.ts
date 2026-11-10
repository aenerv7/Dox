import { Window } from "happy-dom";

// Node 26 默认启用实验性 webstorage；未配置 --localstorage-file 时 globalThis.localStorage
// 是一个返回 undefined 的 getter，会遮蔽 happy-dom 注入的同名全局，让依赖它的测试失败。
if (typeof globalThis.localStorage === "undefined") {
  const storage = new Window({ url: "http://localhost/" }).localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}
