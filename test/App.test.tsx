import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App.js";

describe("App", () => {
  it("renders a complete responsive puzzle and opens history in-place", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
    const grid = await screen.findByRole("grid");
    expect(grid.querySelectorAll("[role=gridcell]").length).toBeGreaterThanOrEqual(70);
    expect(screen.getAllByText(/^[a-z]+$/i).length).toBeGreaterThan(4);
    await user.click(screen.getByRole("button", { name: "Open history" }));
    expect(await screen.findByRole("dialog", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Global progress" })).toHaveTextContent("Progress0 / 500Total time00:00Words found0Letters0");
    await user.click(screen.getByRole("button", { name: "Close history" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "History" })).not.toBeInTheDocument());
  });

  it("changes away from a system-dark preference on the first mode click", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: query === "(prefers-color-scheme: dark)", addEventListener() {}, removeEventListener() {} }) });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    await user.click(screen.getByRole("button", { name: "Toggle color mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
