import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RouteAnalyzer } from './route-analyzer';
import { parseEventFromJSON } from './io/json-io';
import { ScoringModelRegistry } from './scoring-models';
import { analyzeCourseLegs } from './course-analysis';
import { createEventRouteAnalyzer } from './event-route-analyzer';

describe('Integration Tests - Stockholm Indoor Cup E1', () => {
  it('should import Stockholm Indoor Cup E1 example and verify leg 2-3 difficulty score', () => {
    // Load the example file
    const examplePath = join(__dirname, '../../../test-data/events/2025-02-01-Stockholm-Indoor-Cup-E1.json');
    const jsonContent = readFileSync(examplePath, 'utf-8');
    
    // Parse the event
    const event = parseEventFromJSON(jsonContent);
    
    // Verify basic event properties
    expect(event.name).toBe("Stockholm Indoor Cup 2025 - Etapp 1");
    expect(event.startTime.date).toBe("2025-02-01");
    expect(event.country).toBe("sweden");
    
    // Verify we have courses, controls, nodes, and edges
    expect(event.raceCourses).toBeDefined();
    expect(event.raceCourses!.length).toBeGreaterThan(0);

    const raceCourse = event.raceCourses![0];
    expect(raceCourse.courses).toBeDefined();
    expect(raceCourse.courses!.length).toBeGreaterThan(0);
    expect(raceCourse.controls).toBeDefined();
    expect(raceCourse.controls!.length).toBeGreaterThan(0);
    expect(raceCourse.vertices).toBeDefined();
    expect(raceCourse.edges).toBeDefined();
    
    // Get the first course
    const course = raceCourse.courses![0];
    expect(course.name).toBeTruthy();
    expect(course.controls.length).toBeGreaterThan(2);
    
    // Find controls for leg 2-3 (control codes "31" and "32")
    // In orienteering, "leg 2-3" typically means from control #2 to control #3
    // which would be from "31" (2nd control after start) to "32" (3rd control after start)
    const control31 = course.controls.find((c) => c.controlId === "31");
    const control32 = course.controls.find((c) => c.controlId === "32");
    
    expect(control31).toBeDefined();
    expect(control32).toBeDefined();
    
    // Get the actual control objects from the event
    const fromControl = raceCourse.controls!.find((c) => c.id === control31!.controlId);
    const toControl = raceCourse.controls!.find((c) => c.id === control32!.controlId);
    
    expect(fromControl).toBeDefined();
    expect(toControl).toBeDefined();
    
    // Get map scale
    const map = raceCourse.maps?.[0];
    const mapScale = map?.scale || 1000;
    
    // Get scoring model - should use the event's specified model if available
    const scoringModel = ScoringModelRegistry.getModelOrDefault(event.difficultyScoringModel);

    // Create RouteAnalyzer with the scoring model
    const analyzer = new RouteAnalyzer(
      raceCourse.controls!,
      raceCourse.vertices!,
      raceCourse.edges!,
      mapScale,
      scoringModel,
    );

    // Calculate difficulty for leg 2-3 (control 31 to control 32)
    const difficulty = analyzer.calculateLegDifficultyBetweenControls(fromControl!, toControl!);

    // Log the actual calculated values for verification
    console.log(`\nLeg 2-3 (${fromControl!.id} → ${toControl!.id}) difficulty: ${difficulty}`);

    // Verify the difficulty score is a valid positive number
    expect(difficulty).toBeGreaterThanOrEqual(0);
    expect(isFinite(difficulty)).toBe(true);
  });

  it('should verify Stockholm Indoor Cup E1 has expected structure', () => {
    // Load the example file
    const examplePath = join(__dirname, '../../../test-data/events/2025-02-01-Stockholm-Indoor-Cup-E1.json');
    const jsonContent = readFileSync(examplePath, 'utf-8');
    
    // Parse the event
    const event = parseEventFromJSON(jsonContent);
    const raceCourse = event.raceCourses![0];
    
    // Verify it has nodes and edges (graph structure)
    expect(raceCourse.vertices).toBeDefined();
    expect(raceCourse.edges).toBeDefined();
    
    if (raceCourse.vertices && raceCourse.edges) {
      expect(raceCourse.vertices.length).toBeGreaterThan(0);
      expect(raceCourse.edges.length).toBeGreaterThan(0);

      // Verify edges have required properties
      const firstEdge = raceCourse.edges[0];
      expect(firstEdge).toHaveProperty("from");
      expect(firstEdge).toHaveProperty("to");
      expect(firstEdge).toHaveProperty("label");
    }
  });

  it('should calculate difficulty for multiple legs in Stockholm Indoor Cup E1', () => {
    // Load the example file
    const examplePath = join(__dirname, '../../../test-data/events/2025-02-01-Stockholm-Indoor-Cup-E1.json');
    const jsonContent = readFileSync(examplePath, 'utf-8');
    
    // Parse the event
    const event = parseEventFromJSON(jsonContent);
    const raceCourse = event.raceCourses![0];
    const course = raceCourse.courses![0];
    const map = raceCourse.maps?.[0];
    const mapScale = map?.scale || 1000;
    const scoringModel = ScoringModelRegistry.getModelOrDefault(event.difficultyScoringModel);
    
    // Create RouteAnalyzer
    const analyzer = new RouteAnalyzer(
      raceCourse.controls!,
      raceCourse.vertices!,
      raceCourse.edges!,
      mapScale,
      scoringModel,
    );
    
    // Calculate difficulty for first 3 legs
    const legs: Array<{ from: string; to: string; difficulty: number }> = [];
    
    for (let i = 0; i < Math.min(3, course.controls.length - 1); i++) {
        const fromCode = course.controls[i].controlId;
        const toCode = course.controls[i + 1].controlId;
        
        const fromControl = raceCourse.controls!.find((c) => c.id === course.controls[i].controlId);
        const toControl = raceCourse.controls!.find((c) => c.id === course.controls[i + 1].controlId);
      
      if (fromControl && toControl) {
        const difficulty = analyzer.calculateLegDifficultyBetweenControls(fromControl, toControl);
        legs.push({ from: fromCode, to: toCode, difficulty });
      }
    }
    
    // Verify we calculated difficulties
    expect(legs.length).toBeGreaterThan(0);
    
    // Each difficulty should be a valid number
    legs.forEach(leg => {
      expect(leg.difficulty).toBeGreaterThanOrEqual(0);
      expect(typeof leg.difficulty).toBe('number');
      expect(isFinite(leg.difficulty)).toBe(true);
    });
    
    // Find leg 2-3 (control 31 to 32) and verify its difficulty
    const leg2to3 = legs.find(leg => leg.from === '31' && leg.to === '32');
    if (leg2to3) {
      expect(leg2to3.difficulty).toBeGreaterThanOrEqual(0);
      console.log(`\nLeg 2-3 difficulty: ${leg2to3.difficulty}`);
    }
  });
});

describe('Integration Tests - Stockholm Indoor Cup 2026 E1', () => {
  it('should find all routes from control 71 to 59 in Bana 1, including route "abcccCAddEEEEe"', () => {
    // Load the 2026 example file
    const examplePath = join(__dirname, '../../../test-data/events/2026-02-07-Stockholm-Indoor-Cup-E1.json');
    const jsonContent = readFileSync(examplePath, 'utf-8');

    // Parse the event
    const event = parseEventFromJSON(jsonContent);
    const raceCourse = event.raceCourses![0];

    // Verify course "Bana 1" exists
    const course = raceCourse.courses!.find(c => c.name === 'Bana 1');
    expect(course).toBeDefined();

    // Control 71 is at index 17, control 59 is at index 18 in Bana 1
    expect(course!.controls[17].controlId).toBe('71');
    expect(course!.controls[18].controlId).toBe('59');

    // Set up the RouteAnalyzer
    const map = raceCourse.maps?.[0];
    const mapScale = map?.scale || 800;
    const scoringModelId = event.difficultyScoringModel || 'stepscore@0.1';
    const scoringModel = ScoringModelRegistry.getModelOrDefault(scoringModelId);

    const analyzer = new RouteAnalyzer(
      raceCourse.controls!,
      raceCourse.vertices!,
      raceCourse.edges!,
      mapScale,
      scoringModel,
      raceCourse.polygons || [],
    );

    // Find all alternative routes from control 71 to control 59
    const routes = analyzer.findAllAlternativePathsBetweenControls('71', '59');

    // Extract compact label strings for each route
    const routeLabels = routes.map(r => r.labels.join(''));
    const uniqueRouteLabels = [...new Set(routeLabels)];

    console.log(`\nFound ${routes.length} routes (${uniqueRouteLabels.length} unique label sequences) from 71 to 59:`);
    uniqueRouteLabels.forEach(seq => {
      const r = routes.find(r2 => r2.labels.join('') === seq)!;
      console.log(`  "${seq}" distance=${r.distance.toFixed(1)} difficulty=${r.difficulty.toFixed(1)}`);
    });

    // The route "abcccCAddEEEEe" is a valid path through the graph
    // (verified by exhaustive cluster-based DFS)
    expect(uniqueRouteLabels).toContain('abcccCAddEEEEe');
  });
});

describe('Integration Tests - Porsgrunn inne-o', () => {
  it('should find all routes from control 109 to 116 (leg 7-8) without hanging', () => {
    const examplePath = join(__dirname, '../../../test-data/events/2026-01-24-Porsgrunn-inne-o.json');
    const jsonContent = readFileSync(examplePath, 'utf-8');
    const event = parseEventFromJSON(jsonContent);
    const raceCourse = event.raceCourses![0];

    const course = raceCourse.courses!.find(c => c.name === 'H17');
    expect(course).toBeDefined();

    // Control 7 = 109, Control 8 = 116
    expect(course!.controls[7].controlId).toBe('109');
    expect(course!.controls[8].controlId).toBe('116');

    const map = raceCourse.maps?.[0];
    const mapScale = map?.scale || 800;
    const scoringModelId = event.difficultyScoringModel || 'stepscore@0.1';
    const scoringModel = ScoringModelRegistry.getModelOrDefault(scoringModelId);

    const analyzer = new RouteAnalyzer(
      raceCourse.controls!,
      raceCourse.vertices!,
      raceCourse.edges!,
      mapScale,
      scoringModel,
      raceCourse.polygons || [],
    );

    const startTime = Date.now();
    const routes = analyzer.findAllAlternativePathsBetweenControls('109', '116');
    const elapsed = Date.now() - startTime;

    console.log(`\nFound ${routes.length} routes from 109 to 116 in ${elapsed}ms`);
    routes.slice(0, 10).forEach(r => {
      console.log(`  "${r.labels.join('')}" distance=${r.distance.toFixed(1)}`);
    });

    expect(routes.length).toBeGreaterThan(0);
    // Must complete within 10 seconds (was previously hanging indefinitely)
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);

  it('should analyze all courses with findAllRoutes=true without hanging', () => {
    const examplePath = join(__dirname, '../../../test-data/events/2026-01-24-Porsgrunn-inne-o.json');
    const jsonContent = readFileSync(examplePath, 'utf-8');
    const event = parseEventFromJSON(jsonContent);
    const raceCourse = event.raceCourses![0];

    const map = raceCourse.maps?.[0];
    const mapScale = map?.scale || 1000;
    const scoringModelId = event.difficultyScoringModel || 'stepscore@0.1';
    const scoringModel = ScoringModelRegistry.getModelOrDefault(scoringModelId);

    const analyzer = new RouteAnalyzer(
      raceCourse.controls!,
      raceCourse.vertices!,
      raceCourse.edges!,
      mapScale,
      scoringModel,
      raceCourse.polygons || [],
    );

    for (const course of raceCourse.courses!) {
      const startTime = Date.now();
      const { legs } = analyzeCourseLegs(course, event, analyzer, true);
      const elapsed = Date.now() - startTime;

      console.log(`\nCourse ${course.name}: ${legs.length} legs in ${elapsed}ms`);

      // Must complete within 30 seconds total per course
      expect(elapsed).toBeLessThan(30_000);
    }
  }, 120_000);
});

describe('Route enumeration completeness (best-first)', () => {
  function loadAnalyzer(file: string) {
    const examplePath = join(__dirname, `../../../test-data/events/${file}`);
    const event = parseEventFromJSON(readFileSync(examplePath, 'utf-8'));
    const raceCourse = event.raceCourses![0];
    const mapScale = raceCourse.maps?.[0]?.scale || 800;
    const scoringModel = ScoringModelRegistry.getModelOrDefault(
      event.difficultyScoringModel || 'stepscore@0.1',
    );
    return new RouteAnalyzer(
      raceCourse.controls!,
      raceCourse.vertices!,
      raceCourse.edges!,
      mapScale,
      scoringModel,
      raceCourse.polygons || [],
    );
  }

  it('Porsgrunn 109->116 enumerates many sequences incl. a 4-label route', () => {
    const analyzer = loadAnalyzer('2026-01-24-Porsgrunn-inne-o.json');
    const routes = analyzer.findAllAlternativePathsBetweenControls('109', '116');

    // Today the DFS finds 1 route (label sequence "r,s"); the real graph has
    // hundreds of distinct sequences, including ones with exactly 4 stairs.
    expect(routes.length).toBeGreaterThanOrEqual(50);
    expect(routes.some(r => r.labels.length === 4)).toBe(true);
  });

  it('returns routes sorted by ascending distance', () => {
    const analyzer = loadAnalyzer('2026-01-24-Porsgrunn-inne-o.json');
    const routes = analyzer.findAllAlternativePathsBetweenControls('109', '116');
    for (let i = 1; i < routes.length; i++) {
      expect(routes[i].distance).toBeGreaterThanOrEqual(routes[i - 1].distance);
    }
  });

  it('Stockholm 71->59 keeps the long route and does not drop sequences at 200', () => {
    const analyzer = loadAnalyzer('2026-02-07-Stockholm-Indoor-Cup-E1.json');
    const routes = analyzer.findAllAlternativePathsBetweenControls('71', '59');
    const labels = new Set(routes.map(r => r.labels.join('')));

    // The 14-label route must survive (it is dropped today by the 200 cap).
    expect(labels.has('abcccCAddEEEEe')).toBe(true);
    // Complete visible-stair-sequence enumeration yields ~264 here, comfortably
    // above the old 200 cap that silently dropped sequences.
    expect(routes.length).toBeGreaterThan(200);
  });

  it('picks the shortest representative per label sequence (deterministic)', () => {
    const analyzer = loadAnalyzer('2026-01-24-Porsgrunn-inne-o.json');
    const a = analyzer.findAllAlternativePathsBetweenControls('109', '116');
    const b = analyzer.findAllAlternativePathsBetweenControls('109', '116');
    const key = (rs: { labels: string[]; distance: number }[]) =>
      rs.map(r => `${r.labels.join('')}@${r.distance.toFixed(2)}`).join('|');
    expect(key(a)).toBe(key(b));
  });

  it('enumerates Porsgrunn 109->116 in under 2 seconds', () => {
    const analyzer = loadAnalyzer('2026-01-24-Porsgrunn-inne-o.json');
    const start = Date.now();
    const routes = analyzer.findAllAlternativePathsBetweenControls('109', '116');
    const elapsed = Date.now() - start;
    expect(routes.length).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('Integration Tests - human route simulation on real events', () => {
  // Regression: legs that need an unlabeled one-way passage used to have no
  // human plan at all (12 % of all example legs).
  it.each([
    '2023-02-05-Stockholm-Indoor-Cup-E2.json',
    '2025-02-01-Stockholm-Indoor-Cup-E1.json',
  ])('plans every course leg that has a route in %s', (file) => {
    const event = parseEventFromJSON(readFileSync(join(__dirname, '../../../test-data/events', file), 'utf-8'));
    const raceCourse = event.raceCourses![0];
    const analyzer = createEventRouteAnalyzer(event);
    const controls = new Map(raceCourse.controls.map((c) => [c.id, c]));

    let legs = 0;
    const unplanned: string[] = [];
    let worstGap = 1;
    for (const course of raceCourse.courses ?? []) {
      for (let i = 0; i + 1 < course.controls.length; i++) {
        const from = controls.get(course.controls[i].controlId);
        const to = controls.get(course.controls[i + 1].controlId);
        if (!from || !to) continue;
        const shortest = analyzer.findShortestPathBetweenControls(from, to);
        if (!shortest || !(shortest.distance > 0)) continue;
        legs++;
        const human = analyzer.findHumanRouteWithTrace(from.id, to.id);
        if (!human) {
          unplanned.push(`${from.id}-${to.id}`);
          continue;
        }
        worstGap = Math.max(worstGap, human.route.distance / shortest.distance);
      }
    }

    expect(legs).toBeGreaterThan(20);
    expect(unplanned).toEqual([]);
    // A plan is never shorter than the shortest route, and stays within reach of it.
    expect(worstGap).toBeLessThan(6);
  });
});
