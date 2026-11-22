import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useServiceWorkerUpdate } from "./use-service-worker-update";
import UpdateNotification from "@/components/update-notification";

/** Minimal stand-ins for the ServiceWorker APIs the hook touches. */
class FakeWorker {
  state = "installing";
  postMessage = vi.fn();
  private listeners: Array<() => void> = [];

  addEventListener(_type: "statechange", listener: () => void) {
    this.listeners.push(listener);
  }

  setState(state: string) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

class FakeRegistration {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
  private listeners: Array<() => void> = [];

  addEventListener(_type: "updatefound", listener: () => void) {
    this.listeners.push(listener);
  }

  /** Simulate a new deployment being found and installed. */
  async installUpdate() {
    // Let the pending register().then() attach its updatefound listener first.
    await act(async () => {});
    const worker = new FakeWorker();
    this.installing = worker;
    for (const listener of this.listeners) listener();
    await act(async () => {
      worker.setState("installed");
    });
    this.waiting = worker;
    return worker;
  }
}

let registration: FakeRegistration;
let containerListeners: Record<string, Array<() => void>>;
let reload: ReturnType<typeof vi.fn>;

function installServiceWorkerMock({ controlled = true }: { controlled?: boolean } = {}) {
  registration = new FakeRegistration();
  containerListeners = {};

  const container = {
    controller: controlled ? {} : null,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, listener: () => void) => {
      const listeners = containerListeners[type] ?? [];
      listeners.push(listener);
      containerListeners[type] = listeners;
    },
    removeEventListener: (type: string, listener: () => void) => {
      containerListeners[type] = (containerListeners[type] ?? []).filter((l) => l !== listener);
    },
  };

  Object.defineProperty(navigator, "serviceWorker", { value: container, configurable: true });
  return container;
}

beforeEach(() => {
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderUpdateHook = () => renderHook(() => useServiceWorkerUpdate({ enabled: true }));

describe("useServiceWorkerUpdate", () => {
  it("registers the service worker and reports no update initially", async () => {
    const container = installServiceWorkerMock();
    const { result } = renderUpdateHook();

    await waitFor(() => expect(container.register).toHaveBeenCalledWith("/sw.js"));
    expect(result.current.updateAvailable).toBe(false);
  });

  it("flags an update once a new worker has installed", async () => {
    installServiceWorkerMock();
    const { result } = renderUpdateHook();
    await waitFor(() => expect(registration.update).not.toHaveBeenCalled());

    await registration.installUpdate();

    await waitFor(() => expect(result.current.updateAvailable).toBe(true));
  });

  it("does not flag an update on a first visit (no controller yet)", async () => {
    installServiceWorkerMock({ controlled: false });
    const { result } = renderUpdateHook();

    await registration.installUpdate();

    expect(result.current.updateAvailable).toBe(false);
  });

  it("picks up an update that was already waiting when the page loaded", async () => {
    installServiceWorkerMock();
    const waiting = new FakeWorker();
    waiting.state = "installed";

    const container = navigator.serviceWorker as unknown as { register: ReturnType<typeof vi.fn> };
    container.register.mockImplementation(async () => {
      registration.waiting = waiting;
      return registration;
    });

    const { result } = renderUpdateHook();
    await waitFor(() => expect(result.current.updateAvailable).toBe(true));
  });

  it("applyUpdate tells the waiting worker to activate", async () => {
    installServiceWorkerMock();
    const { result } = renderUpdateHook();
    const worker = await registration.installUpdate();
    await waitFor(() => expect(result.current.updateAvailable).toBe(true));

    act(() => result.current.applyUpdate());

    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(result.current.updateAvailable).toBe(false);
  });

  it("reloads exactly once when the new worker takes control", async () => {
    installServiceWorkerMock();
    renderUpdateHook();
    await waitFor(() => expect(containerListeners.controllerchange).toHaveLength(1));

    act(() => {
      for (const listener of containerListeners.controllerchange) listener();
      for (const listener of containerListeners.controllerchange) listener();
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the first-install worker claims the page", async () => {
    installServiceWorkerMock({ controlled: false });
    renderUpdateHook();
    await waitFor(() => expect(containerListeners.controllerchange).toHaveLength(1));

    act(() => {
      for (const listener of containerListeners.controllerchange) listener();
    });

    expect(reload).not.toHaveBeenCalled();
  });

  it("dismissUpdate hides the notification without reloading", async () => {
    installServiceWorkerMock();
    const { result } = renderUpdateHook();
    await registration.installUpdate();
    await waitFor(() => expect(result.current.updateAvailable).toBe(true));

    act(() => result.current.dismissUpdate());

    expect(result.current.updateAvailable).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("polls for updates on the configured interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installServiceWorkerMock();
    renderHook(() => useServiceWorkerUpdate({ enabled: true, checkIntervalMs: 1000 }));
    await waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalled());

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(registration.update.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it("does nothing when service workers are unavailable", () => {
    Object.defineProperty(navigator, "serviceWorker", { value: undefined, configurable: true });
    const { result } = renderUpdateHook();
    expect(result.current.updateAvailable).toBe(false);
  });
});

describe("UpdateNotification", () => {
  it("stays hidden until an update is waiting, then offers a reload", async () => {
    installServiceWorkerMock();
    // The component registers with production defaults disabled in tests, so
    // drive it through the same mocked container by forcing NODE_ENV.
    vi.stubEnv("NODE_ENV", "production");

    render(<UpdateNotification />);
    expect(screen.queryByText(/new version is available/i)).toBeNull();

    await registration.installUpdate();

    const banner = await screen.findByText(/new version is available/i);
    expect(banner).toBeTruthy();

    await act(async () => {
      screen.getByRole("button", { name: /reload/i }).click();
    });
    expect(registration.waiting?.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    vi.unstubAllEnvs();
  });
});
