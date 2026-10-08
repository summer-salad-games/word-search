import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
});

Object.defineProperties(window.screen, {
  width: { configurable: true, value: 390 },
  height: { configurable: true, value: 844 },
});

if (globalThis.crypto.randomUUID === undefined) {
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: () => "00000000-0000-4000-8000-000000000000" });
}
