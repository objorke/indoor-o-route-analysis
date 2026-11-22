import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseEventFromJSON } from "./json-io";
import { TrainingDataIO } from "./training-data-io";
import { RouteAnalyzer } from "../route-analyzer";
import { analyzeCourseLegs } from "../course-analysis";
import { ScoringModelRegistry } from "../scoring-models";

const EXAMPLE_FILE = path.join(process.cwd(), '../../test-data/events/2025-02-01-Stockholm-Indoor-Cup-E1.json');

function loadExample() {
  const fileContent = fs.readFileSync(EXAMPLE_FILE, 'utf-8');
  const event = parseEventFromJSON(fileContent);
  const raceCourse = event.raceCourses![0];
  const course = raceCourse.courses![0];
  const scoringModel = ScoringModelRegistry.getModelOrDefault(event.difficultyScoringModel);
  const mapScale = raceCourse.maps?.[0]?.scale ?? 1000;

  const routeAnalyzer = new RouteAnalyzer(
    raceCourse.controls || [],
    raceCourse.vertices || [],
    raceCourse.edges || [],
    mapScale,
    scoringModel,
    raceCourse.polygons || []
  );

  return { event, course, scoringModel, routeAnalyzer };
}

describe('TrainingDataIO', () => {
  it('should include difficulty on every route of each leg', async () => {
    const { event, course, routeAnalyzer } = loadExample();

    const { legs, routes } = analyzeCourseLegs(course, event, routeAnalyzer, true);
    const trainingCourse = TrainingDataIO.generateCourseData(event, course, legs, routes);

    expect(trainingCourse.validRoutes.length).toBeGreaterThan(0);

    for (let i = 0; i < trainingCourse.validRoutes.length; i++) {
      const legRoutes = trainingCourse.validRoutes[i];
      expect(legRoutes.length).toBeGreaterThan(0);
      // Every route in the leg carries the leg-level difficulty
      for (const route of legRoutes) {
        expect(route.difficulty).toBeDefined();
        expect(typeof route.difficulty).toBe('number');
      }
    }
  }, 20000);

  it('should include difficultyScoringModel in event export', async () => {
    const { event, course, scoringModel, routeAnalyzer } = loadExample();

    const { legs, routes } = analyzeCourseLegs(course, event, routeAnalyzer, true);
    const trainingCourse = TrainingDataIO.generateCourseData(event, course, legs, routes);
    const trainingEvent = TrainingDataIO.generateEventExport(event, [trainingCourse], scoringModel.getFullId());

    expect(trainingEvent.difficultyScoringModel).toBeDefined();
    expect(typeof trainingEvent.difficultyScoringModel).toBe('string');
    expect(trainingEvent.difficultyScoringModel.length).toBeGreaterThan(0);
  }, 20000);

  it('difficulty scores should be non-negative numbers', async () => {
    const { event, course, routeAnalyzer } = loadExample();

    const { legs, routes } = analyzeCourseLegs(course, event, routeAnalyzer, true);
    const trainingCourse = TrainingDataIO.generateCourseData(event, course, legs, routes);

    for (const legRoutes of trainingCourse.validRoutes) {
      const difficulty = legRoutes[0].difficulty!;
      expect(typeof difficulty).toBe('number');
      expect(difficulty).toBeGreaterThanOrEqual(0);
    }
  }, 20000);

  it('exported routes match the "show all routes" enumeration for each leg', async () => {
    const { event, course, routeAnalyzer } = loadExample();

    // Mirror the web app's "show all routes" view: exhaustive enumeration per leg.
    const { legs, routes } = analyzeCourseLegs(course, event, routeAnalyzer, true, 50);
    const trainingCourse = TrainingDataIO.generateCourseData(event, course, legs, routes);

    // validRoutes is positional (legs.map), so index by leg position, not leg.id.
    legs.forEach((leg, idx) => {
      const expected = routeAnalyzer
        .findAllAlternativePathsBetweenControls(leg.fromControlId, leg.toControlId, 50)
        .map((r) => (r.description ? r.description.replace(/[,\s]/g, "") : "-"));
      const exported = trainingCourse.validRoutes[idx].map((r) => r.route);

      // Same set of route names (order may differ only by ties at equal distance).
      expect(new Set(exported)).toEqual(new Set(expected));
    });
  }, 20000);
});
