import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App.js";

describe("App", () => {
  it("renders a complete responsive puzzle and opens history in-place", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: "New Game" })).toBeInTheDocument();
    expect(screen.getByText("Version 1.1.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New Game" }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Version 1.1.0")).not.toBeInTheDocument();
    const grid = await screen.findByRole("grid");
    expect(grid.querySelectorAll("[role=gridcell]").length).toBeGreaterThanOrEqual(70);
    expect(screen.getAllByText(/^[a-z]+$/i).length).toBeGreaterThan(4);
    const feedbackButton = screen.getByRole("button", { name: "Disable sound and haptics" });
    await user.click(feedbackButton);
    expect(screen.getByRole("button", { name: "Enable sound and haptics" })).toHaveAttribute("aria-pressed", "false");
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
    await user.click(await screen.findByRole("button", { name: /New Game|Continue/ }));
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    await user.click(screen.getByRole("button", { name: "Toggle color mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("traps dialog focus, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /New Game|Continue/ }));
    await screen.findByRole("heading", { level: 1 });
    const resetButton = screen.getByRole("button", { name: "Reset progress" });
    resetButton.focus();
    await user.click(resetButton);
    const dialog = await screen.findByRole("dialog", { name: "What would you like to reset?" });
    const buttons = screen.getAllByRole("button").filter((button) => dialog.contains(button));
    expect(buttons[0]).toHaveFocus();
    buttons.at(-1)!.focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "What would you like to reset?" })).not.toBeInTheDocument();
    expect(resetButton).toHaveFocus();
  });
});
