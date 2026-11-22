import { describe, it, expect } from "vitest";
import { migrateEventData } from "./migrations";

describe("migrateEventData", () => {
  it("fills in defaults for id, name, and startTime when missing", () => {
    const migrated = migrateEventData({});
    expect(migrated.id).toBe("");
    expect(migrated.name).toBe("");
    expect(migrated.startTime.date).toBe(new Date().toISOString().split("T")[0]);
  });

  it("passes through already-flat (new-shape) top-level fields unchanged", () => {
    const migrated = migrateEventData({
      id: "e1",
      name: "Test Event",
      startTime: { date: "2026-01-01" },
      country: "norway",
      eventUrl: "https://example.com",
      eventImageUrl: "https://example.com/img.png",
      difficultyScoringModel: "alpha@0.1",
    });
    expect(migrated).toMatchObject({
      id: "e1",
      name: "Test Event",
      startTime: { date: "2026-01-01" },
      country: "norway",
      eventUrl: "https://example.com",
      eventImageUrl: "https://example.com/img.png",
      difficultyScoringModel: "alpha@0.1",
    });
  });

  it("falls back to the old extensions wrapper for country/eventUrl/eventImageUrl/difficultyScoringModel", () => {
    const migrated = migrateEventData({
      id: "e1",
      name: "Test Event",
      extensions: {
        country: "sweden",
        eventUrl: "https://old.example.com",
        eventImageUrl: "https://old.example.com/img.png",
        difficultyScoringModel: "beta@0.1",
      },
    });
    expect(migrated.country).toBe("sweden");
    expect(migrated.eventUrl).toBe("https://old.example.com");
    expect(migrated.eventImageUrl).toBe("https://old.example.com/img.png");
    expect(migrated.difficultyScoringModel).toBe("beta@0.1");
  });

  it("prefers top-level fields over extensions when both are present", () => {
    const migrated = migrateEventData({
      id: "e1",
      name: "Test Event",
      country: "norway",
      extensions: { country: "sweden" },
    });
    expect(migrated.country).toBe("norway");
  });

  it("removes the extensions wrapper from the output", () => {
    const migrated = migrateEventData({ id: "e1", name: "Test", extensions: { country: "norway" } });
    expect(migrated).not.toHaveProperty("extensions");
  });

  it("defaults country to an empty string when neither top-level nor extensions provide it", () => {
    const migrated = migrateEventData({ id: "e1", name: "Test" });
    expect(migrated.country).toBe("");
  });

  it("leaves raceCourses undefined when absent", () => {
    const migrated = migrateEventData({ id: "e1", name: "Test" });
    expect(migrated.raceCourses).toBeUndefined();
  });

  describe("race course migration", () => {
    it("migrates vertices/polygons/customRoutes from the extensions wrapper", () => {
      const migrated = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{
          extensions: {
            vertices: [{ id: "n1", x: 0, y: 0 }],
            polygons: [{ id: "p1", level: 1, points: [] }],
            customRoutes: [{ id: "r1" }],
          },
        }],
      });
      const rc = migrated.raceCourses![0];
      expect(rc.vertices).toEqual([{ id: "n1", x: 0, y: 0 }]);
      expect(rc.polygons).toEqual([{ id: "p1", level: 1, points: [] }]);
      expect(rc.customRoutes).toEqual([{ id: "r1" }]);
      expect(rc).not.toHaveProperty("extensions");
    });

    it("prefers top-level vertices/polygons/customRoutes over extensions", () => {
      const migrated = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{
          vertices: [{ id: "new", x: 1, y: 1 }],
          extensions: { vertices: [{ id: "old", x: 0, y: 0 }] },
        }],
      });
      expect(migrated.raceCourses![0].vertices).toEqual([{ id: "new", x: 1, y: 1 }]);
    });

    it("strips the legacy id field from every edge, from either source", () => {
      const migratedFromExtensions = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{
          extensions: { edges: [{ id: "edge-1", from: "a", to: "b", label: "A" }] },
        }],
      });
      expect(migratedFromExtensions.raceCourses![0].edges).toEqual([{ from: "a", to: "b", label: "A" }]);

      const migratedFromTopLevel = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{
          edges: [{ id: "edge-2", from: "c", to: "d", label: "B", oneWay: true }],
        }],
      });
      expect(migratedFromTopLevel.raceCourses![0].edges).toEqual([{ from: "c", to: "d", label: "B", oneWay: true }]);
    });

    it("leaves edges undefined when neither top-level nor extensions provide them", () => {
      const migrated = migrateEventData({ id: "e1", name: "Test", raceCourses: [{}] });
      expect(migrated.raceCourses![0].edges).toBeUndefined();
    });

    it("migrates nested courses, controls, and maps", () => {
      const migrated = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{
          courses: [{ id: "c1", name: "Course 1", controls: [], mapId: "m1", extensions: { numberOfCompetitors: 42 } }],
          controls: [{ id: "ctrl1", type: "control", mapPosition: { x: 5, y: 5 }, extensions: {} }],
          maps: [{ scale: 1000, extensions: { layout: "vertical", saveEncoded: true } }],
        }],
      });
      const rc = migrated.raceCourses![0];
      expect(rc.courses![0].numberOfCompetitors).toBe(42);
      expect(rc.courses![0]).not.toHaveProperty("extensions");
      expect(rc.controls![0]).not.toHaveProperty("extensions");
      expect(rc.maps![0].layout).toBe("vertical");
      expect(rc.maps![0].saveEncoded).toBe(true);
      expect(rc.maps![0]).not.toHaveProperty("extensions");
    });
  });

  describe("map data migration", () => {
    it("defaults layout to horizontal when neither top-level nor extensions provide it", () => {
      const migrated = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{ maps: [{ scale: 1000 }] }],
      });
      expect(migrated.raceCourses![0].maps![0].layout).toBe("horizontal");
    });

    it("prefers a top-level saveEncoded of false over an extensions fallback of true", () => {
      // saveEncoded uses an explicit `!== undefined` check rather than `||`,
      // so an explicit false must NOT fall back to a truthy extensions value.
      const migrated = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{ maps: [{ scale: 1000, saveEncoded: false, extensions: { saveEncoded: true } }] }],
      });
      expect(migrated.raceCourses![0].maps![0].saveEncoded).toBe(false);
    });

    it("falls back to extensions.saveEncoded when the top-level field is absent", () => {
      const migrated = migrateEventData({
        id: "e1",
        name: "Test",
        raceCourses: [{ maps: [{ scale: 1000, extensions: { saveEncoded: true } }] }],
      });
      expect(migrated.raceCourses![0].maps![0].saveEncoded).toBe(true);
    });
  });

  it("is idempotent: migrating an already-migrated event again produces the same result", () => {
    const original = {
      id: "e1",
      name: "Test",
      country: "norway" as const,
      raceCourses: [{
        vertices: [{ id: "n1", x: 0, y: 0 }],
        courses: [{ id: "c1", name: "Course 1", controls: [], mapId: "m1", numberOfCompetitors: 10 }],
      }],
    };
    const once = migrateEventData(original);
    const twice = migrateEventData(once);
    expect(twice).toEqual(once);
  });
});

describe("migrateEventData: deprecated map fields", () => {
  it("drops showControlPoints (now an app setting) and keeps the rest of the map", () => {
    const migrated = migrateEventData({
      id: "e",
      name: "n",
      raceCourses: [{ maps: [{ id: "m", scale: 400, image: { url: "x.pdf" }, showControlPoints: true, layout: "pages" }] }],
    });
    const map = migrated.raceCourses?.[0].maps?.[0] as unknown as Record<string, unknown>;
    expect("showControlPoints" in map).toBe(false);
    expect(map.scale).toBe(400);
    expect(map.layout).toBe("pages");
  });
});
