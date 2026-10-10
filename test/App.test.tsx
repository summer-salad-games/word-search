import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App.js";

describe("App", () => {
  it("renders a complete responsive puzzle and opens history in-place", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: "New Game" })).toBeInTheDocument();
    expect(document.querySelectorAll(".menu-cell").length).toBeGreaterThan(80);
    expect(screen.queryByText(/Version 1\.1\.0/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New Game" }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Version 1\.1\.0/i)).not.toBeInTheDocument();
    const grid = await screen.findByRole("grid");
    expect(grid.querySelectorAll("[role=gridcell]").length).toBeGreaterThanOrEqual(70);
    expect(screen.getAllByText(/^[a-z]+$/i).length).toBeGreaterThan(4);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Version 1.1.0")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("75");
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "37" } });
    expect(screen.getByText("37%")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Vibration/ }));
    expect(screen.getByRole("checkbox", { name: /Vibration/ })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Close menu" }));
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
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: "Use light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("traps dialog focus, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /New Game|Continue/ }));
    await screen.findByRole("heading", { level: 1 });
    const menuButton = screen.getByRole("button", { name: "Open menu" });
    menuButton.focus();
    await user.click(menuButton);
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    const buttons = screen.getAllByRole("button").filter((button) => dialog.contains(button));
    expect(buttons[0]).toHaveFocus();
    buttons.at(-1)!.focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });
});
