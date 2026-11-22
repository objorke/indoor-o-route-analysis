import type { Control } from "./models/control";
import type { Course } from "./models/course";
import type { Node, Edge } from "./models/graph";
import type { RaceCourseData } from "./models/event";

/**
 * Checks if a control ID is unique among existing controls.
 * @param newId The new ID to check.
 * @param controls The list of existing controls.
 * @param currentId The current ID of the control being edited (to exclude self).
 * @returns True if the ID is unique, false otherwise.
 */
export function isControlIdUnique(newId: string, controls: Control[], currentId?: string): boolean {
  if (!newId) return false;
  return !controls.some((c) => c.id === newId && c.id !== currentId);
}

/**
 * Updates the control ID in a list of controls.
 * @param controls The list of controls.
 * @param oldId The old ID to replace.
 * @param newId The new ID.
 * @returns A new list of controls with the ID updated.
 */
export function updateControlIdInControls(controls: Control[], oldId: string, newId: string): Control[] {
  return controls.map((c) => (c.id === oldId ? { ...c, id: newId } : c));
}

/**
 * Updates the control ID in all courses that reference the old ID.
 * @param courses The list of courses.
 * @param oldId The old control ID.
 * @param newId The new control ID.
 * @returns A new list of courses with the control ID updated.
 */
export function updateControlIdInCourses(courses: Course[], oldId: string, newId: string): Course[] {
  return courses.map((course) => ({
    ...course,
    controls: (course.controls || []).map((cc) =>
      cc.controlId === oldId ? { ...cc, controlId: newId } : cc
    ),
  }));
}

/**
 * Updates the control ID in the graph (vertices and edges).
 * @param nodes The list of graph vertices.
 * @param edges The list of graph edges.
 * @param oldId The old control ID.
 * @param newId The new control ID.
 * @returns An object containing the updated nodes and edges.
 */
export function updateControlIdInGraph(
  nodes: Node[],
  edges: Edge[],
  oldId: string,
  newId: string
): { nodes: Node[]; edges: Edge[] } {
  const updatedNodes = nodes.map((node) =>
    node.id === oldId ? { ...node, id: newId } : node
  );
  const updatedEdges = edges.map((edge) => {
    const isFrom = edge.from === oldId;
    const isTo = edge.to === oldId;
    if (isFrom || isTo) {
      return {
        ...edge,
        from: isFrom ? newId : edge.from,
        to: isTo ? newId : edge.to,
      };
    }
    return edge;
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}

/** Names of the courses that use a control (each course once, in course order). */
export function getCoursesUsingControl(courses: Course[], controlId: string): Course[] {
  return courses.filter((course) => (course.controls || []).some((cc) => cc.controlId === controlId));
}

/**
 * Delete a control everywhere it is referenced: the control list, every
 * course's control sequence, and graph edges to or from it. This is the single
 * implementation used by all views, so no dangling course legs or edges remain.
 */
export function removeControl(raceCourse: RaceCourseData, controlId: string): RaceCourseData {
  return {
    ...raceCourse,
    controls: raceCourse.controls?.filter((c) => c.id !== controlId),
    courses: raceCourse.courses?.map((course) =>
      (course.controls || []).some((cc) => cc.controlId === controlId)
        ? { ...course, controls: course.controls.filter((cc) => cc.controlId !== controlId) }
        : course,
    ),
    ...(raceCourse.edges
      ? { edges: raceCourse.edges.filter((e) => e.from !== controlId && e.to !== controlId) }
      : {}),
  };
}
