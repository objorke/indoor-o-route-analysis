import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initDB,
  saveEvent,
  getEvent,
  getAllEvents,
  updateEvent,
  deleteEvent,
  saveMapFile,
  getMapFile,
  getEventPdfData,
  getCacheSize,
  clearCache,
  saveEventMetadata,
  getEventMetadata,
  getAllEventMetadata,
  addRecentFile,
  getRecentFiles,
  clearRecentFiles,
  deleteDatabase,
  clearAllUserData,
} from "./indexeddb";
import type { EventData } from "./models/event";

/** Clears every object store's contents (rather than deleting the whole database) so each test starts clean without needing to close/reopen the shared cached connection. */
async function clearAllStores(): Promise<void> {
  const database = await initDB();
  const storeNames = Array.from(database.objectStoreNames);
  await Promise.all(
    storeNames.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const tx = database.transaction(name, "readwrite");
          tx.objectStore(name).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    ),
  );
}

function makeEvent(id: string, overrides: Partial<EventData> = {}): EventData {
  return {
    id,
    name: `Event ${id}`,
    startTime: { date: "2026-01-01" },
    country: "norway",
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAllStores();
  localStorage.clear();
});

describe("initDB", () => {
  it("creates all four object stores", async () => {
    const database = await initDB();
    expect(Array.from(database.objectStoreNames).sort()).toEqual(
      ["event_files", "event_metadata", "events", "recent_files"].sort(),
    );
  });

  it("returns the same cached connection on repeated calls", async () => {
    const a = await initDB();
    const b = await initDB();
    expect(a).toBe(b);
  });
});

describe("event CRUD", () => {
  it("round-trips an event through saveEvent/getEvent", async () => {
    const event = makeEvent("e1");
    await saveEvent(event);
    expect(await getEvent("e1")).toEqual(event);
  });

  it("returns undefined for an event that was never saved", async () => {
    expect(await getEvent("missing")).toBeUndefined();
  });

  it("lists every saved event via getAllEvents", async () => {
    await saveEvent(makeEvent("e1"));
    await saveEvent(makeEvent("e2"));
    const all = await getAllEvents();
    expect(all.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("merges partial updates via updateEvent", async () => {
    await saveEvent(makeEvent("e1"));
    await updateEvent("e1", { name: "Renamed" });
    const updated = await getEvent("e1");
    expect(updated?.name).toBe("Renamed");
    expect(updated?.country).toBe("norway"); // untouched fields survive the merge
  });

  it("rejects updateEvent for an event that doesn't exist", async () => {
    await expect(updateEvent("missing", { name: "x" })).rejects.toThrow(/not found/);
  });

  it("deletes an event via deleteEvent", async () => {
    await saveEvent(makeEvent("e1"));
    await deleteEvent("e1");
    expect(await getEvent("e1")).toBeUndefined();
  });
});

describe("map file storage", () => {
  it("round-trips a PDF file through saveMapFile/getMapFile", async () => {
    const data = new TextEncoder().encode("fake pdf bytes").buffer;
    await saveMapFile("map1", data);
    expect(await getMapFile("map1")).toEqual(data);
  });

  it("returns undefined for a map file that was never saved", async () => {
    expect(await getMapFile("missing")).toBeUndefined();
  });

  it("stores an event's PDF under its primary map id when saveEvent is given pdfData", async () => {
    const data = new TextEncoder().encode("map pdf").buffer;
    const event = makeEvent("e1", {
      raceCourses: [{ maps: [{ id: "map1", scale: 1000, image: {}, mapPositionTopLeft: { x: 0, y: 0 }, layout: "horizontal" }] }],
    });
    await saveEvent(event, data);
    expect(await getEventPdfData("map1")).toEqual(data);
  });

  it("falls back to the event id when the event has no primary map", async () => {
    const data = new TextEncoder().encode("fallback pdf").buffer;
    await saveEvent(makeEvent("e1"), data);
    expect(await getEventPdfData("e1")).toEqual(data);
  });

  it("deleteEvent removes both the event-id and map-id file entries", async () => {
    const data = new TextEncoder().encode("pdf").buffer;
    const event = makeEvent("e1", {
      raceCourses: [{ maps: [{ id: "map1", scale: 1000, image: {}, mapPositionTopLeft: { x: 0, y: 0 }, layout: "horizontal" }] }],
    });
    await saveEvent(event, data);
    await deleteEvent("e1");
    expect(await getEventPdfData("map1")).toBeUndefined();
    expect(await getEventPdfData("e1")).toBeUndefined();
  });
});

describe("cache operations", () => {
  it("sums byte lengths of all stored files via getCacheSize", async () => {
    await saveMapFile("m1", new ArrayBuffer(100));
    await saveMapFile("m2", new ArrayBuffer(250));
    expect(await getCacheSize()).toBe(350);
  });

  it("returns zero for an empty cache", async () => {
    expect(await getCacheSize()).toBe(0);
  });

  it("clearCache empties the files store without touching events", async () => {
    await saveEvent(makeEvent("e1"));
    await saveMapFile("m1", new ArrayBuffer(100));
    await clearCache();
    expect(await getCacheSize()).toBe(0);
    expect(await getEvent("e1")).toEqual(makeEvent("e1"));
  });
});

describe("event metadata", () => {
  it("round-trips metadata through saveEventMetadata/getEventMetadata", async () => {
    await saveEventMetadata("e1", { localFilename: "course.xml" });
    expect(await getEventMetadata("e1")).toEqual({ id: "e1", localFilename: "course.xml" });
  });

  it("merges repeated saveEventMetadata calls instead of overwriting", async () => {
    await saveEventMetadata("e1", { localFilename: "a.xml" });
    await saveEventMetadata("e1", {});
    expect(await getEventMetadata("e1")).toEqual({ id: "e1", localFilename: "a.xml" });
  });

  it("lists all metadata records via getAllEventMetadata", async () => {
    await saveEventMetadata("e1", { localFilename: "a.xml" });
    await saveEventMetadata("e2", { localFilename: "b.xml" });
    const all = await getAllEventMetadata();
    expect(all.map((m) => m.id).sort()).toEqual(["e1", "e2"]);
  });
});

describe("recent files (localStorage-backed)", () => {
  it("returns an empty list when nothing has been recorded", async () => {
    expect(await getRecentFiles()).toEqual([]);
  });

  it("adds a recent file and can read it back", async () => {
    await addRecentFile({ name: "course.xml", url: "https://example.com/course.xml" });
    const files = await getRecentFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "course.xml", url: "https://example.com/course.xml" });
  });

  it("moves a re-added file to the front instead of duplicating it", async () => {
    // addRecentFile stamps lastUsed with Date.now(); advance the clock between
    // calls so ties don't leave the sort with nothing to reorder on.
    vi.useFakeTimers();
    try {
      await addRecentFile({ name: "a.xml" });
      vi.advanceTimersByTime(10);
      await addRecentFile({ name: "b.xml" });
      vi.advanceTimersByTime(10);
      await addRecentFile({ name: "a.xml" });
    } finally {
      vi.useRealTimers();
    }
    const files = await getRecentFiles();
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("a.xml");
  });

  it("caps the list at 10 entries, keeping the most recently used", async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 12; i++) {
        await addRecentFile({ name: `file${i}.xml` });
        vi.advanceTimersByTime(10);
      }
    } finally {
      vi.useRealTimers();
    }
    const files = await getRecentFiles();
    expect(files).toHaveLength(10);
    expect(files[0].name).toBe("file11.xml");
    expect(files.map((f) => f.name)).not.toContain("file0.xml");
  });

  it("clears the recent files list", async () => {
    await addRecentFile({ name: "a.xml" });
    await clearRecentFiles();
    expect(await getRecentFiles()).toEqual([]);
  });
});

describe("deleteDatabase", () => {
  it("removes all stored events and map files, and a fresh connection still works", async () => {
    await saveEvent(makeEvent("e1"));
    await saveMapFile("m1", new ArrayBuffer(8));
    await deleteDatabase();
    expect(await getAllEvents()).toEqual([]);
    expect(await getMapFile("m1")).toBeUndefined();
    await saveEvent(makeEvent("e2"));
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["e2"]);
  });
});

describe("clearAllUserData", () => {
  it("removes stored events and local/session storage", async () => {
    await saveEvent(makeEvent("e1"));
    localStorage.setItem("app-running-speed", "5");
    sessionStorage.setItem("x", "1");
    await clearAllUserData();
    expect(await getAllEvents()).toEqual([]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
