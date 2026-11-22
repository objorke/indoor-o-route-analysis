import { describe, it, expect } from "vitest";
import { traceToExplanation } from "./human-route-explanation";
import { ONE_WAY_PASSAGE_LABEL } from "./human-route";
import { buildHumanRouteLabelResolver, type HumanRouteLabelResolver } from "./human-route-labels";
import type { HumanRouteResult, RouteInfo } from "./route-analyzer";
import type { Node } from "./models/graph";
import type { Polygon } from "./models/polygon";

function stubRoute(path: string[], labels: string[]): RouteInfo {
  return {
    distance: 0,
    path,
    pathPolygons: path.map(() => undefined),
    decisionPoints: 0,
    decisionPointNodeIds: [],
    branchingPointNodeIds: [],
    alternativeEdges: 0,
    oneWayEdges: 0,
    ignoreLengthEdges: 0,
    description: labels.join(""),
    labels,
    difficulty: 0,
  };
}

const sameFloorResult: HumanRouteResult = {
  route: stubRoute(["S", "T"], []),
  sameFloor: true,
  forwardLabels: [],
  backwardLabels: [],
  explorationTrace: [],
  meetingAttempts: [],
};

const multiFloorResult: HumanRouteResult = {
  route: stubRoute(["S", "A", "B", "C", "D", "T"], ["1", "2"]),
  sameFloor: false,
  forwardLabels: ["1"],
  backwardLabels: ["2"],
  explorationTrace: [
    { order: 0, side: "tracking", cluster: "F1", candidates: [
      { label: "1", toCluster: "F2", distanceMeters: 5 },
      { label: "3", toCluster: "F4", distanceMeters: 50 },
    ] },
    { order: 1, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
  ],
  meetingAttempts: [{ order: 2, cluster: "F2", accepted: true }],
  clusterOf: { S: "F1", T: "F3" },
};

describe("traceToExplanation", () => {
  it("produces one message per frame, indexed to match, including the leading same-floor-check frame", () => {
    const messages = traceToExplanation(multiFloorResult);
    expect(messages).toHaveLength(4);
    expect(messages.map((m) => m.frameIndex)).toEqual([0, 1, 2, 3]);
  });

  it("opens a multi-floor route with a same-floor-check message", () => {
    const messages = traceToExplanation(multiFloorResult);
    expect(messages[0].text).toBe("Same floor? No - we need to check the stairs.");
  });

  it("lists all candidate stair labels in a natural-language list and names the choice", () => {
    const messages = traceToExplanation(multiFloorResult);
    expect(messages[1].text).toContain("1 and 3");
    expect(messages[1].text).toContain("Let us try");
  });

  it("distinguishes tracking (starts with 'From') from backtracking (prefixed 'Backtracking: To ...')", () => {
    const messages = traceToExplanation(multiFloorResult);
    expect(messages[1].text).toMatch(/^From\b/);
    expect(messages[2].text).toMatch(/^Backtracking: To\b/);
  });

  it("falls back to a plain origin phrase when no label resolver or memory snapshot is available", () => {
    const messages = traceToExplanation(multiFloorResult);
    expect(messages[1].text).toContain("From the start");
    expect(messages[2].text).toContain("To the control");
  });

  it("assembles the closing message from the full label sequence", () => {
    const messages = traceToExplanation(multiFloorResult);
    const closing = messages[messages.length - 1];
    expect(closing.text).toContain("1");
    expect(closing.text).toContain("2");
  });

  it("gives a same-floor message with no stair labels and no same-floor-check message", () => {
    const messages = traceToExplanation(sameFloorResult);
    expect(messages).toHaveLength(1);
    expect(messages[0].text.toLowerCase()).not.toMatch(/stair/);
  });

  it("is deterministic across repeated calls", () => {
    const a = traceToExplanation(multiFloorResult);
    const b = traceToExplanation(multiFloorResult);
    expect(a).toEqual(b);
  });

  it("explains a rejected meeting distinctly from an accepted one", () => {
    const withRejection: HumanRouteResult = {
      ...multiFloorResult,
      explorationTrace: [
        { order: 0, side: "tracking", cluster: "F1", candidates: [{ label: "1", toCluster: "F2", distanceMeters: 5 }] },
        { order: 2, side: "backtracking", cluster: "F3", candidates: [{ label: "2", toCluster: "F2", distanceMeters: 5 }] },
      ],
      meetingAttempts: [
        { order: 1, cluster: "F2", accepted: false, reason: "stair-reuse" },
        { order: 3, cluster: "F2", accepted: true },
      ],
    };
    const messages = traceToExplanation(withRejection);
    expect(messages).toHaveLength(5);
    expect(messages[2].text.toLowerCase()).toMatch(/twice|again/);
  });
});

describe("traceToExplanation — with a label resolver", () => {
  function square(id: string, level: number, x0: number, y0: number, size: number): Polygon {
    return { id, level, points: [{ x: x0, y: y0 }, { x: x0 + size, y: y0 }, { x: x0 + size, y: y0 + size }, { x: x0, y: y0 + size }] };
  }

  const nodes: Node[] = [
    { id: "F1", x: 5, y: 5 } as Node,
    { id: "F3", x: 5, y: 105 } as Node,
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const polygons: Polygon[] = [square("p1", 1, 0, 0, 10), square("p2", 2, 0, 100, 10)];

  function makeResolver(): HumanRouteLabelResolver {
    return buildHumanRouteLabelResolver({
      clusterOf: { S: "F1", T: "F3" },
      fromNodeId: "S",
      fromLabel: "S",
      toNodeId: "T",
      toLabel: "3",
      resolveNode: (id) => byId.get(id) ?? null,
      getCoordinates: (item) => ({ x: (item as Node).x, y: (item as Node).y }),
      polygons,
    });
  }

  it("names the leg's own control number on the first step of each side", () => {
    const messages = traceToExplanation(multiFloorResult, makeResolver());
    expect(messages[1].text).toContain("From control S");
    expect(messages[2].text).toContain("To control 3");
  });

  it("includes the floor alongside the control number when resolvable", () => {
    const messages = traceToExplanation(multiFloorResult, makeResolver());
    expect(messages[1].text).toContain("From control S on floor 1");
    expect(messages[2].text).toContain("To control 3 on floor 2");
  });

  it("opens with a same-floor-check message, independent of the label resolver", () => {
    const messages = traceToExplanation(multiFloorResult, makeResolver());
    expect(messages[0].text).toBe("Same floor? No - we need to check the stairs.");
  });
});

describe("traceToExplanation — direction reasoning", () => {
  // Eight distinct one-node floors, laid out so every node resolves to its
  // own floor polygon: start (floor 1), up2 (floor 2, candidate A's target
  // from the first tracking step), floor4node (floor 4, a later tracking
  // step reached after some stairs), floor3low (floor 3, candidate D's
  // target), end (floor 3, the "control 4" backward-side control), floor2node
  // (floor 2, candidate A's target from the first backtracking step),
  // floor2node_step3 (floor 2, a later backtracking step already anchored on
  // stair A), floor3node_forH (floor 3, candidate H's target).
  function square(id: string, level: number, y0: number): Polygon {
    return { id, level, points: [{ x: 0, y: y0 }, { x: 10, y: y0 }, { x: 10, y: y0 + 10 }, { x: 0, y: y0 + 10 }] };
  }
  const nodeIds = ["start", "up2", "floor4node", "floor3low", "end", "floor2node", "floor2node_step3", "floor3node_forH"];
  const nodes: Node[] = nodeIds.map((id, i) => ({ id, x: 5, y: i * 20 + 5 }) as Node);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const polygons: Polygon[] = [
    square("p-start", 1, 0),
    square("p-up2", 2, 20),
    square("p-floor4node", 4, 40),
    square("p-floor3low", 3, 60),
    square("p-end", 3, 80),
    square("p-floor2node", 2, 100),
    square("p-floor2node-step3", 2, 120),
    square("p-floor3node-forH", 3, 140),
  ];

  const resolver = buildHumanRouteLabelResolver({
    clusterOf: { start: "start", end: "end" },
    fromNodeId: "start",
    fromLabel: "3",
    toNodeId: "end",
    toLabel: "4",
    resolveNode: (id) => byId.get(id) ?? null,
    getCoordinates: (item) => ({ x: (item as Node).x, y: (item as Node).y }),
    polygons,
  });

  const emptyMemory = { forwardChain: [], backwardChain: [], forwardPath: [], backwardPath: [], forwardPending: [], backwardPending: [] };

  const result: HumanRouteResult = {
    route: stubRoute(["start", "end"], ["A"]),
    sameFloor: false,
    forwardLabels: ["A"],
    backwardLabels: [],
    explorationTrace: [
      {
        order: 0, side: "tracking", cluster: "start",
        candidates: [
          { label: "A", toCluster: "up2", distanceMeters: 5 },
          { label: "B", toCluster: "nowhereB", distanceMeters: 10 },
          { label: "C", toCluster: "nowhereC", distanceMeters: 15 },
        ],
      },
      {
        order: 1, side: "tracking", cluster: "floor4node",
        candidates: [
          { label: "D", toCluster: "floor3low", distanceMeters: 5 },
          { label: "E", toCluster: "nowhereE", distanceMeters: 10 },
        ],
        memory: { ...emptyMemory, forwardChain: ["A"] },
      },
      {
        order: 2, side: "backtracking", cluster: "end",
        candidates: [
          { label: "A", toCluster: "floor2node", distanceMeters: 5 },
          { label: "B", toCluster: "nowhereB2", distanceMeters: 10 },
          { label: "C", toCluster: "nowhereC2", distanceMeters: 15 },
        ],
      },
      {
        order: 3, side: "backtracking", cluster: "floor2node_step3",
        candidates: [
          { label: "H", toCluster: "floor3node_forH", distanceMeters: 5 },
          { label: "I", toCluster: "nowhereI", distanceMeters: 10 },
        ],
        memory: { ...emptyMemory, backwardChain: ["A"] },
      },
    ],
    meetingAttempts: [],
  };

  it("opens with a same-floor-check message", () => {
    const messages = traceToExplanation(result, resolver);
    expect(messages[0].text).toBe("Same floor? No - we need to check the stairs.");
  });

  it("narrates a first tracking step: control, floor, full candidate list, and the up/down choice", () => {
    const messages = traceToExplanation(result, resolver);
    expect(messages[1].text).toBe("From control 3 on floor 1, we can reach stairs A, B and C. Let us try up A.");
  });

  it("narrates a later tracking step by floor only, dropping the earlier stair name", () => {
    const messages = traceToExplanation(result, resolver);
    expect(messages[2].text).toBe("From floor 4, we can reach stairs D and E. Let us try down D.");
  });

  it("narrates a first backtracking step with the reasoning direction, stated as a direct instruction", () => {
    const messages = traceToExplanation(result, resolver);
    expect(messages[3].text).toBe(
      "Backtracking: To control 4 on floor 3, we can come from stairs A, B and C. Let us try up A from floor 2.",
    );
  });

  it("narrates a later backtracking step anchored on the previous stair", () => {
    const messages = traceToExplanation(result, resolver);
    expect(messages[4].text).toBe(
      "Backtracking: To get to stair A on floor 2, we can come from stairs H and I. Let us try down H from floor 3.",
    );
  });
});

describe("traceToExplanation — one-way passages", () => {
  const result: HumanRouteResult = {
    route: stubRoute(["S", "A", "B", "C", "D", "T"], ["1"]),
    sameFloor: false,
    forwardLabels: [ONE_WAY_PASSAGE_LABEL],
    backwardLabels: ["1"],
    explorationTrace: [
      { order: 0, side: "tracking", cluster: "R1", candidates: [
        { label: ONE_WAY_PASSAGE_LABEL, toCluster: "R2", distanceMeters: 5 },
        { label: "2", toCluster: "R4", distanceMeters: 50 },
      ] },
      { order: 1, side: "backtracking", cluster: "R3", candidates: [{ label: "1", toCluster: "R2", distanceMeters: 5 }] },
    ],
    meetingAttempts: [{ order: 2, cluster: "R2", accepted: true }],
    clusterOf: { S: "R1", T: "R3" },
  };

  it("spells the passage out instead of calling it a stair", () => {
    const messages = traceToExplanation(result);
    expect(messages[1].text).toContain("we can reach stair 2 and a one-way passage");
    expect(messages[1].text).toContain("Let us try the one-way passage.");
    expect(messages[1].text).not.toContain(ONE_WAY_PASSAGE_LABEL);
  });

  it("names it in the final plan", () => {
    const messages = traceToExplanation(result);
    expect(messages[messages.length - 1].text).toContain("the one-way passage, 1");
  });
});
