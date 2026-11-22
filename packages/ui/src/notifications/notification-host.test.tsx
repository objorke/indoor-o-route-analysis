import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationHost } from "./notification-host";
import { createNoticeStore } from "./notice-store";

afterEach(cleanup);

describe("NotificationHost", () => {
  it("shows notices and dismisses them", () => {
    const store = createNoticeStore();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify("Saved", { kind: "success" });
      store.notify("Failed to load", { kind: "error" });
    });
    expect(screen.getByRole("status").textContent).toContain("Saved");
    expect(screen.getByRole("alert").textContent).toContain("Failed to load");
    fireEvent.click(screen.getAllByLabelText("Dismiss")[0]);
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("confirm dialog resolves on button and Escape", async () => {
    const store = createNoticeStore();
    render(<NotificationHost store={store} />);
    let p!: Promise<boolean>;
    act(() => {
      p = store.confirm("Delete route?", { title: "Delete", confirmLabel: "Delete", destructive: true });
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await expect(p).resolves.toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    let q!: Promise<boolean>;
    act(() => {
      q = store.confirm("Again?");
    });
    fireEvent.keyDown(window, { key: "Escape" });
    await expect(q).resolves.toBe(false);
  });
});
