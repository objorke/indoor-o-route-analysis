
import { describe, it, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseEventFromJSON } from '../io/json-io';
import { RouteAnalyzer } from '../route-analyzer';
import { ScoringModelRegistry } from './registry';
import { EventData } from '../models/event';

describe('Full Event Scoring', () => {
  let eventData: EventData;

  beforeAll(() => {
    const filePath = path.join(process.cwd(), '../../test-data/events/2023-02-04-Stockholm-Indoor-Cup-E1.json');
    const jsonString = fs.readFileSync(filePath, 'utf-8');
    eventData = parseEventFromJSON(jsonString);
  });

  it('should calculate difficulty for the reference leg 3-4 and verify scaling', () => {
    const raceCourse = eventData.raceCourses?.[0];
    if (!raceCourse) {
      throw new Error('No race course found in event data');
    }
    const course = raceCourse.courses?.[0]; // Bana 1 (the only course)
    if (!course) {
      throw new Error('No course found in race course data');
    }
    // Reference leg 3→4 (the leg the Alpha model is normalized against).
    // Controls are ordered: Start, 1, 2, 3, 4...
    // In the controls array: 0=Start, 1=#1, 2=#2, 3=#3, 4=#4.
    if (course.controls.length < 5) {
      throw new Error("Course has fewer than 5 controls (Start, 1, 2, 3, 4)");
    }

    const fromControlRef = course.controls[3];
    const toControlRef = course.controls[4];

    // Get the actual Control objects from the event data to ensure we have coordinates
    const startControl = raceCourse.controls?.find(c => c.id === fromControlRef.controlId);
    const endControl = raceCourse.controls?.find(c => c.id === toControlRef.controlId);

    if (!startControl || !endControl) {
      throw new Error(`Could not find controls for leg 3-4 (IDs: ${fromControlRef.controlId} -> ${toControlRef.controlId})`);
    }

    const models = ScoringModelRegistry.getAllModels();
    const errors: string[] = [];

    const vertices = raceCourse.vertices || [];
    const edges = raceCourse.edges || [];
    const polygons = raceCourse.polygons || [];
    const map = raceCourse.maps?.[0];

    models.forEach(model => {
      console.log(`Testing model: ${model.getFullId()}`);
      
      const routeAnalyzer = new RouteAnalyzer(
        raceCourse.controls || [],
        vertices,
        edges,
        map?.scale || 1000, 
        model,
        polygons
      );

      const routes = routeAnalyzer.findAlternativePathsBetweenControls(startControl.id, endControl.id);
      
      // Sort by distance to find shortest
      routes.sort((a, b) => a.distance - b.distance);
      const shortestRoute = routes[0];

      if (!shortestRoute) {
        throw new Error(`No route found for model ${model.getFullId()}`);
      }

      const difficulty = shortestRoute.difficulty;

      if (Math.abs(difficulty - 100) > 0.1) {
          const msg = `Model ${model.getFullId()}: Difficulty score is ${difficulty} (Raw approx: ${difficulty / (model as any).scalingFactor})`;
          console.log(msg);
          errors.push(msg);
      }
    });

    if (errors.length > 0) {
        throw new Error(`Scaling verification failed for ${errors.length} models:\n${errors.join('\n')}`);
    }
  });
});
