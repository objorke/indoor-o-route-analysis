import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { mergeRaceCourse, type EventData } from "@indoor-o-route-analysis/core";
import { AppDataProvider, useAppData } from "./app-data-context";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AppDataProvider>{children}</AppDataProvider>;
}

const makeEvent = (): EventData =>
  ({
    id: "evt-1",
    name: "Test",
    startTime: { date: "2026-01-01" },
    raceCourses: [
      {
        controls: [{ id: "31", type: "control", mapPosition: { x: 1, y: 1 } }],
        courses: [{ id: "c1", name: "A", mapId: "", controls: [] }],
        maps: [],
      },
    ],
  }) as unknown as EventData;

describe("AppDataContext.updateEvent", () => {
  beforeEach(() => localStorage.clear());

  it("applies two edits made before a re-render without losing either", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.isLoadingEvents).toBe(false));
    await act(async () => {
      await result.current.addEvent(makeEvent());
    });

    await act(async () => {
      // Both edits run in the same tick; neither sees a re-render in between
      void result.current.updateEvent("evt-1", (e) => mergeRaceCourse(e, { controls: [] }));
      void result.current.updateEvent("evt-1", (e) =>
        mergeRaceCourse(e, { courses: [{ id: "c2", name: "B", mapId: "", controls: [] }] }),
      );
    });

    const rc = result.current.selectedEvent?.raceCourses?.[0];
    expect(rc?.controls).toEqual([]);
    expect(rc?.courses?.map((c) => c.id)).toEqual(["c2"]);
    expect(result.current.unsavedChanges).toBe(true);
  });

  it("updateEventData still shallow-merges top-level fields", async () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(result.current.isLoadingEvents).toBe(false));
    await act(async () => {
      await result.current.addEvent(makeEvent());
    });
    await act(async () => {
      await result.current.updateEventData("evt-1", { name: "Renamed" });
    });
    expect(result.current.selectedEvent?.name).toBe("Renamed");
    expect(result.current.selectedEvent?.raceCourses?.[0].controls).toHaveLength(1);
  });
});

describe("AppDataContext undo/redo", () => {
  beforeEach(() => localStorage.clear());

  async function setup() {
    const hook = renderHook(() => useAppData(), { wrapper });
    await waitFor(() => expect(hook.result.current.isLoadingEvents).toBe(false));
    await act(async () => {
      await hook.result.current.addEvent(makeEvent());
    });
    return hook;
  }
  const controlsOf = (r: { current: ReturnType<typeof useAppData> }) =>
    r.current.selectedEvent?.raceCourses?.[0]?.controls?.map((c) => c.id);

  it("undoes and redoes an edit, with labels", async () => {
    const { result } = await setup();
    expect(result.current.canUndo).toBe(false);
    await act(async () => {
      await result.current.updateEvent("evt-1", (e) => mergeRaceCourse(e, { controls: [] }), undefined, {
        label: "Delete control",
      });
    });
    expect(controlsOf(result)).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoLabel).toBe("Delete control");

    act(() => result.current.undo());
    expect(controlsOf(result)).toEqual(["31"]);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.redoLabel).toBe("Delete control");

    act(() => result.current.redo());
    expect(controlsOf(result)).toEqual([]);
  });

  it("undoing back to the saved state clears unsavedChanges", async () => {
    const { result } = await setup();
    act(() => result.current.markAsSaved());
    await act(async () => {
      await result.current.updateEventData("evt-1", { name: "Renamed" });
    });
    expect(result.current.unsavedChanges).toBe(true);
    act(() => result.current.undo());
    expect(result.current.selectedEvent?.name).toBe("Test");
    expect(result.current.unsavedChanges).toBe(false);
  });

  it("coalesces rapid edits (e.g. a drag) into one step", async () => {
    const { result } = await setup();
    await act(async () => {
      for (const x of [2, 3, 4]) {
        await result.current.updateEvent("evt-1", (e) =>
          mergeRaceCourse(e, { controls: [{ id: "31", type: "control", mapPosition: { x, y: 1 } }] }),
        );
      }
    });
    act(() => result.current.undo());
    expect(result.current.selectedEvent?.raceCourses?.[0].controls?.[0].mapPosition.x).toBe(1);
    expect(result.current.canUndo).toBe(false);
  });

  it("record: false does not create an undo step", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.updateEvent("evt-1", (e) => ({ ...e, name: "Derived" }), undefined, { record: false });
    });
    expect(result.current.canUndo).toBe(false);
  });

  it("clears a selected control that disappears after undo", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.updateEvent("evt-1", (e) =>
        mergeRaceCourse(e, {
          controls: [...(e.raceCourses?.[0].controls ?? []), { id: "32", type: "control", mapPosition: { x: 5, y: 5 } }],
        }),
      );
    });
    act(() => result.current.setSelectedControlId("32"));
    expect(result.current.selectedControlId).toBe("32");
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.selectedControlId).toBeNull());
  });
});
