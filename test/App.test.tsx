import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App.js";

describe("App", () => {
  it("renders a complete responsive puzzle and opens history in-place", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Nature" })).toBeInTheDocument();
    const grid = await screen.findByRole("grid");
    expect(grid.querySelectorAll("[role=gridcell]").length).toBeGreaterThan(100);
    expect(screen.getAllByText(/^[a-z]+$/i).length).toBeGreaterThan(4);
    await user.click(screen.getByRole("button", { name: "Open history" }));
    expect(await screen.findByRole("dialog", { name: "History" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close history" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "History" })).not.toBeInTheDocument());
  });
});
