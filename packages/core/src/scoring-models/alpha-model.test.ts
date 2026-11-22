import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { AlphaScoringModel } from './alpha-model';
import { parseEventFromJSON } from '../io/json-io';
import { RouteAnalyzer } from '../route-analyzer';
import {
  noDecisionPointContexts,
  decisionPointContexts,
  deadEndContexts,
  edgeDirectionContexts,
  levelChangeContexts,
  edgeCaseContexts,
  oneRouteContexts,
} from './test-fixtures';

describe('AlphaScoringModel', () => {
  const model = new AlphaScoringModel();

  it('should have correct metadata', () => {
    expect(model.id).toBe('alpha');
    expect(model.name).toBe('Alpha');
    expect(model.version).toBe('0.1');
    expect(model.description).toContain('Difficulty');
  });

  describe('calculateDifficulty', () => {
    describe('no branching points', () => {
      for (const [name, context] of Object.entries(noDecisionPointContexts)) {
        it(`should score 0 for ${name}`, () => {
          expect(model.calculateDifficulty(context)).toBe(0);
        });
      }
    });

    describe('one-route graphs', () => {
      for (const [name, context] of Object.entries(oneRouteContexts)) {
        it(`should score 0 for ${name}`, () => {
          expect(model.calculateDifficulty(context)).toBe(0);
        });
      }
    });

    describe('branching points', () => {
      it('should score 1 branching point for a simple binary choice', () => {
        const d = model.calculateDifficulty(decisionPointContexts.simpleDecision);
        expect(d).toBeGreaterThan(0);
      });

      it('should score higher with more branching points on path', () => {
        const two = model.calculateDifficulty(decisionPointContexts.twoDecisionPoints);
        const one = model.calculateDifficulty(decisionPointContexts.withAlternative);
        expect(two).toBeGreaterThan(one);
      });

      it('should score higher with branch than without', () => {
        const withAlt = model.calculateDifficulty(decisionPointContexts.withAlternative);
        const withoutAlt = model.calculateDifficulty(decisionPointContexts.withoutAlternative);
        expect(withAlt).toBeGreaterThan(withoutAlt);
      });

      it('should score zero for corridor without alternatives', () => {
        expect(model.calculateDifficulty(decisionPointContexts.withoutAlternative)).toBe(0);
      });
    });

    describe('dead ends', () => {
      it('should score dead-end routes (branching point at branch)', () => {
        const deep = model.calculateDifficulty(deadEndContexts.deepChain);
        const branch = model.calculateDifficulty(deadEndContexts.branching);
        expect(deep).toBeGreaterThan(0);
        expect(branch).toBeGreaterThan(0);
      });
    });

    describe('edge direction', () => {
      it('should count one-way outgoing edges as branching but not one-way incoming', () => {
        const bidir = model.calculateDifficulty(edgeDirectionContexts.bidirectionalFalseArc);
        const oneWay = model.calculateDifficulty(edgeDirectionContexts.oneWayNotReversible);
        // The bidirectional arc n3↔n1 gives n1 a second outgoing choice → branching.
        // The one-way arc n3→n1 points INTO n1 and cannot be reversed → not branching.
        expect(bidir).toBeGreaterThan(0);
        expect(oneWay).toBe(0);
      });

      it('should score zero for one-way corridor (no branching, no stairs)', () => {
        expect(model.calculateDifficulty(edgeDirectionContexts.oneWayThenRegular)).toBe(0);
      });
    });

    describe('level changes', () => {
      it('should increase difficulty for upstairs', () => {
        const d = model.calculateDifficulty(levelChangeContexts.upstairs);
        expect(d).toBeGreaterThan(0);
      });

      it('should score upstairs and downstairs equally', () => {
        const up = model.calculateDifficulty(levelChangeContexts.upstairs);
        const down = model.calculateDifficulty(levelChangeContexts.downstairs);
        expect(up).toBe(down);
      });

      it('should handle corridor then stairs', () => {
        expect(model.calculateDifficulty(levelChangeContexts.corridorThenStairs)).toBeGreaterThan(0);
      });

      it('should accumulate for consecutive stairs', () => {
        const single = model.calculateDifficulty(levelChangeContexts.upstairs);
        const consecutive = model.calculateDifficulty(levelChangeContexts.consecutiveStairs);
        expect(consecutive).toBeGreaterThan(single);
      });

      it('should handle corridor-stairs-corridor', () => {
        const mixed = model.calculateDifficulty(levelChangeContexts.corridorStairsCorridor);
        expect(mixed).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should return 0 for empty path', () => {
        expect(model.calculateDifficulty(edgeCaseContexts.emptyPath)).toBe(0);
      });

      it('should return 0 for single node', () => {
        expect(model.calculateDifficulty(edgeCaseContexts.singleNode)).toBe(0);
      });
    });
  });

  describe('getDifficultyCategory', () => {
    it('should return correct categories', () => {
      expect(model.getDifficultyCategory(10).name).toBe('white');
      expect(model.getDifficultyCategory(30).name).toBe('yellow');
      expect(model.getDifficultyCategory(50).name).toBe('orange');
      expect(model.getDifficultyCategory(70).name).toBe('purple');
      expect(model.getDifficultyCategory(90).name).toBe('black');
    });
  });

  describe('getCourseDifficulty', () => {
    it('should return maximum leg difficulty', () => {
      expect(model.getCourseDifficulty([{ difficulty: 20 }, { difficulty: 60 }, { difficulty: 40 }])).toBe(60);
    });

    it('should return 0 for empty course', () => {
      expect(model.getCourseDifficulty([])).toBe(0);
    });
  });

  describe('getFullId', () => {
    it('should return id@version format', () => {
      expect(model.getFullId()).toBe('alpha@0.1');
    });
  });

  describe('reference course normalization', () => {
    it('should score 100 for the shortest route of leg 3→4 on Bana 1 (Stockholm Indoor Cup 2023 E1)', () => {
      const filePath = join(__dirname, '../../../../test-data/events/2023-02-04-Stockholm-Indoor-Cup-E1.json');
      const event = parseEventFromJSON(readFileSync(filePath, 'utf-8'));
      const raceCourse = event.raceCourses![0];
      const course = raceCourse.courses![0];
      expect(course.name).toBe('Bana 1');

      const controls = raceCourse.controls!;
      const mapScale = raceCourse.maps?.[0]?.scale ?? 700;
      const analyzer = new RouteAnalyzer(
        controls,
        raceCourse.vertices!,
        raceCourse.edges!,
        mapScale,
        model,
        raceCourse.polygons ?? [],
      );

      // Leg 3→4 corresponds to controls 33→34
      const fromControl = controls.find((c: any) => c.id === '33');
      const toControl = controls.find((c: any) => c.id === '34');
      expect(fromControl).toBeDefined();
      expect(toControl).toBeDefined();

      // Normalization is based on the shortest route (the one shown in the UI),
      // not the lowest-difficulty path.
      const routes = analyzer.findAlternativePathsBetweenControls(fromControl!.id, toControl!.id);
      routes.sort((a, b) => a.distance - b.distance);
      const shortest = routes[0];
      expect(shortest).toBeDefined();
      expect(shortest.difficulty).toBeCloseTo(100, 6);
    });
  });
});
