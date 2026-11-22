import type { Control } from "./models/control";
import type { EventData } from "./models/event";
import type { RouteAnalyzer } from "./route-analyzer";
import { createEventRouteAnalyzer } from "./event-route-analyzer";

// Difficulty levels based on Stockholm Indoor Cup definitions
export type DifficultyLevel = "white" | "yellow" | "orange" | "purple" | "black";

export interface DifficultyLevelConfig {
  name: string;
  description: string;
  maxStairsPerLeg: number;
  maxOneWayPerLeg: number;
  maxAlternativeEdgesPerLeg: number;
  targetDifficultyPerLeg: number;
}

export const DIFFICULTY_LEVELS: Record<DifficultyLevel, DifficultyLevelConfig> = {
  white: {
    name: "White",
    description: "Same floor or few obvious floor changes. Short distance, no risk of wrong direction.",
    maxStairsPerLeg: 1,
    maxOneWayPerLeg: 1,
    maxAlternativeEdgesPerLeg: 2,
    targetDifficultyPerLeg: 2,
  },
  yellow: {
    name: "Yellow",
    description: "Only one floor change per control. Few route choices with no wrong direction risk.",
    maxStairsPerLeg: 1,
    maxOneWayPerLeg: 2,
    maxAlternativeEdgesPerLeg: 4,
    targetDifficultyPerLeg: 4,
  },
  orange: {
    name: "Orange",
    description: "Maximum 3 stairs per control. Multiple route choices, not obvious which stair to use.",
    maxStairsPerLeg: 3,
    maxOneWayPerLeg: 1,
    maxAlternativeEdgesPerLeg: 8,
    targetDifficultyPerLeg: 7,
  },
  purple: {
    name: "Purple",
    description: "Similar to black but shorter. Some difficult controls but not extremely advanced.",
    maxStairsPerLeg: 4,
    maxOneWayPerLeg: 2,
    maxAlternativeEdgesPerLeg: 12,
    targetDifficultyPerLeg: 10,
  },
  black: {
    name: "Black",
    description: "Most difficult. Many complex stair changes, one-ways, and advanced route choices.",
    maxStairsPerLeg: 10,
    maxOneWayPerLeg: 5,
    maxAlternativeEdgesPerLeg: 20,
    targetDifficultyPerLeg: 15,
  },
};

export interface CourseGeneratorParams {
  numControls: number;
  difficultyLevel: DifficultyLevel;
  targetLength: number;
  mode: "existing" | "create";
}

export interface GeneratedCourse {
  controls: Control[];
  length: number;
  difficulty: number;
}

export interface GenerationProgress {
  iteration: number;
  totalIterations: number;
  currentLeg: number;
  totalLegs: number;
  bestScore: number;
}

export class CourseGenerator {
  private controls: Control[];
  private routeAnalyzer: RouteAnalyzer;

  /**
   * @param controls - Candidate controls for the generated course
   * @param routeAnalyzer - Analyzer for the event; create it with
   *   `createEventRouteAnalyzer(event)` so leg difficulties match the rest of
   *   the app (floor polygons, scoring model, map scale).
   */
  constructor(controls: Control[], routeAnalyzer: RouteAnalyzer) {
    this.controls = controls;
    this.routeAnalyzer = routeAnalyzer;
  }

  /** Course generator for an event, set up like every other analysis. */
  static forEvent(event: EventData): CourseGenerator {
    return new CourseGenerator(event.raceCourses?.[0]?.controls ?? [], createEventRouteAnalyzer(event));
  }

  // Calculate route distance between two controls using the graph
  private calculateRouteDistance(c1: Control, c2: Control): number {
    return this.routeAnalyzer.calculateRouteDistance(c1, c2);
  }

  // Calculate total course length using route distances
  private calculateCourseLength(controls: Control[]): number {
    return this.routeAnalyzer.calculateCourseLength(controls);
  }

  // Calculate difficulty for a leg between two controls
  private calculateLegDifficultyBetweenControls(c1: Control, c2: Control): number {
    return this.routeAnalyzer.calculateLegDifficultyBetweenControls(c1, c2);
  }

  // Calculate total course difficulty using graph paths
  private calculateCourseDifficulty(controls: Control[]): number {
    return this.routeAnalyzer.calculateCourseDifficulty(controls);
  }

  // Check if graph is available
  private hasGraph(): boolean {
    return this.routeAnalyzer.hasGraph();
  }

  // Check if a course matches the difficulty level constraints
  private checkDifficultyLevelMatch(
    controls: Control[],
    levelConfig: DifficultyLevelConfig
  ): { matches: boolean; score: number; totalDifficulty: number } {
    let totalDifficulty = 0;
    let penaltyScore = 0;
    const numLegs = controls.length - 1;

    for (let i = 0; i < numLegs; i++) {
      const legDiff = this.routeAnalyzer.calculateDetailedLegDifficultyBetweenControls(controls[i], controls[i + 1]);
      totalDifficulty += legDiff.total;

      // Penalize legs that exceed the difficulty level limits
      if (legDiff.stairs > levelConfig.maxStairsPerLeg) {
        penaltyScore += (legDiff.stairs - levelConfig.maxStairsPerLeg) * 10;
      }
      if (legDiff.oneWay > levelConfig.maxOneWayPerLeg) {
        penaltyScore += (legDiff.oneWay - levelConfig.maxOneWayPerLeg) * 5;
      }
      if (legDiff.alternativeEdges > levelConfig.maxAlternativeEdgesPerLeg) {
        penaltyScore += (legDiff.alternativeEdges - levelConfig.maxAlternativeEdgesPerLeg) * 2;
      }
    }

    // Calculate how close we are to target difficulty
    const targetTotalDifficulty = levelConfig.targetDifficultyPerLeg * numLegs;
    const difficultyError = Math.abs(totalDifficulty - targetTotalDifficulty) / Math.max(targetTotalDifficulty, 1);

    return {
      matches: penaltyScore === 0,
      score: penaltyScore + difficultyError * 10,
      totalDifficulty,
    };
  }

  // Generate a course based on parameters
  async generate(
    params: CourseGeneratorParams,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<GeneratedCourse | null> {
    // Find start and finish controls
    const startControl = this.controls.find((c) => c.type === "start");
    const finishControl = this.controls.find((c) => c.type === "finish");

    if (!startControl || !finishControl) {
      return null;
    }

    // Get intermediate controls (excluding start and finish)
    const intermediateControls = this.controls.filter(
      (c) => c.type === "control" && c.id !== startControl.id && c.id !== finishControl.id
    );

    // numControls now represents the number of intermediate controls (excluding start and finish)
    if (intermediateControls.length < params.numControls) {
      return null;
    }

    const hasGraph = this.hasGraph();
    const levelConfig = DIFFICULTY_LEVELS[params.difficultyLevel];

    // Use more iterations for better results
    const maxIterations = 500;
    let bestCourse: Control[] | null = null;
    let bestScore = Infinity;
    let bestLength = 0;
    let bestDifficulty = 0;

    // Pre-calculate distances and difficulties for efficiency
    const distanceCache = new Map<string, number>();
    const difficultyCache = new Map<string, number>();

    const getCachedDistance = (c1: Control, c2: Control): number => {
      const key = `${c1.id}-${c2.id}`;
      if (!distanceCache.has(key)) {
        distanceCache.set(key, this.calculateRouteDistance(c1, c2));
      }
      return distanceCache.get(key)!;
    };

    const getCachedDifficulty = (c1: Control, c2: Control): number => {
      if (!hasGraph) return 0;
      const key = `${c1.id}-${c2.id}`;
      if (!difficultyCache.has(key)) {
        difficultyCache.set(key, this.calculateLegDifficultyBetweenControls(c1, c2));
      }
      return difficultyCache.get(key)!;
    };

    // Target values
    const targetLength = params.targetLength;
    const targetDifficultyPerLeg = levelConfig.targetDifficultyPerLeg;
    const numLegs = params.numControls + 1; // legs = intermediate controls + 1 (start->first, last->finish)
    const targetTotalDifficulty = targetDifficultyPerLeg * numLegs;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Call progress callback
      if (onProgress && iter % 10 === 0) {
        onProgress({
          iteration: iter + 1,
          totalIterations: maxIterations,
          currentLeg: 0,
          totalLegs: params.numControls,
          bestScore: bestScore === Infinity ? 999 : bestScore,
        });
      }

      // Yield to the event loop periodically to avoid UI freeze
      if (iter % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // GREEDY CONSTRUCTION: Build course leg by leg
      const course: Control[] = [startControl];
      const available = [...intermediateControls];
      let currentLength = 0;
      let currentDifficulty = 0;

      // Select intermediate controls greedily with randomization
      for (let leg = 0; leg < params.numControls; leg++) {
        const current = course[course.length - 1];
        const legsRemaining = numLegs - leg;
        const lengthRemaining = targetLength - currentLength;
        const idealLegLength = lengthRemaining / legsRemaining;
        const difficultyRemaining = targetTotalDifficulty - currentDifficulty;
        const idealLegDifficulty = difficultyRemaining / legsRemaining;

        // Score each available control
        let bestControl: Control | null = null;
        let bestControlScore = Infinity;

        // Add randomness: shuffle and consider top candidates
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        const candidates = shuffled.slice(0, Math.min(20, shuffled.length));

        for (const candidate of candidates) {
          const dist = getCachedDistance(current, candidate);
          const diff = getCachedDifficulty(current, candidate);

          // Also consider distance to finish from this candidate
          const distToFinish = getCachedDistance(candidate, finishControl);
          const totalEstimatedLength = currentLength + dist + distToFinish;

          // Score based on how well this leg matches ideals
          const lengthError = Math.abs(dist - idealLegLength) / Math.max(idealLegLength, 1);
          const diffError = hasGraph ? Math.abs(diff - idealLegDifficulty) / Math.max(idealLegDifficulty, 1) : 0;

          // Penalize if we'd overshoot total length significantly
          const overshootPenalty = totalEstimatedLength > targetLength * 1.5 ? 10 : 0;

          // Penalize if we'd undershoot total length significantly
          const undershootPenalty = totalEstimatedLength < targetLength * 0.5 ? 5 : 0;

          const score = lengthError * 2 + diffError * 3 + overshootPenalty + undershootPenalty;

          if (score < bestControlScore) {
            bestControlScore = score;
            bestControl = candidate;
          }
        }

        if (bestControl) {
          course.push(bestControl);
          available.splice(available.indexOf(bestControl), 1);
          currentLength += getCachedDistance(current, bestControl);
          currentDifficulty += getCachedDifficulty(current, bestControl);
        }
      }

      // Add finish
      course.push(finishControl);
      currentLength += getCachedDistance(course[course.length - 2], finishControl);
      currentDifficulty += getCachedDifficulty(course[course.length - 2], finishControl);

      // Calculate final score
      const lengthError = Math.abs(currentLength - targetLength) / targetLength;
      const difficultyError = hasGraph
        ? Math.abs(currentDifficulty - targetTotalDifficulty) / Math.max(targetTotalDifficulty, 1)
        : 0;

      // Check constraint violations
      let constraintPenalty = 0;
      if (hasGraph) {
        const diffCheck = this.checkDifficultyLevelMatch(course, levelConfig);
        constraintPenalty = diffCheck.score;
      }

      const score = lengthError * 5 + difficultyError * 5 + constraintPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestCourse = course;
        bestLength = currentLength;
        bestDifficulty = currentDifficulty;
      }

      // Early exit if we found a good match
      if (lengthError < 0.1 && difficultyError < 0.2 && constraintPenalty < 1) {
        break;
      }
    }

    if (!bestCourse) {
      return null;
    }

    return {
      controls: bestCourse,
      length: bestLength,
      difficulty: bestDifficulty,
    };
  }
}
