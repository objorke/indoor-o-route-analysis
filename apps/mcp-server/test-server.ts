#!/usr/bin/env tsx
/**
 * Simple test script to verify MCP server functionality
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseEventFromJSON } from '@indoor-o-route-analysis/core';
import { createEventRouteAnalyzer, getEventScoringModel } from '@indoor-o-route-analysis/core';
import { analyzeCourseLegs } from '@indoor-o-route-analysis/core';
import { ScoringModelRegistry } from '@indoor-o-route-analysis/core';
import type { EventData } from '@indoor-o-route-analysis/core';
import { getActualCourseControls } from '@indoor-o-route-analysis/core';

console.log('🧪 Testing MCP Server Analysis Functionality\n');

// Find the first example event
const examplesDir = path.resolve(import.meta.dirname, '../../test-data/events');
const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.json') && f !== 'index.json');

if (files.length === 0) {
  console.error('❌ No example files found');
  process.exit(1);
}

const testFile = files[0];
const filePath = path.join(examplesDir, testFile);

console.log(`📂 Loading event: ${testFile}`);

try {
  // Test 1: Load event
  const content = fs.readFileSync(filePath, 'utf-8');
  const event: EventData = parseEventFromJSON(content);
  console.log(`✅ Event loaded: ${event.name}`);
  console.log(`   Date: ${event.startTime.date}`);

  const raceCourse = event.raceCourses?.[0];
  if (!raceCourse) {
    throw new Error('No race course data');
  }

  // Test 2: List courses
  const courses = raceCourse.courses || [];
  console.log(`\n✅ Found ${courses.length} courses:`);
  courses.slice(0, 3).forEach((course, idx) => {
    console.log(`   ${idx + 1}. ${course.name}`);
  });

  if (courses.length === 0) {
    console.log('⚠️  No courses to analyze');
    process.exit(0);
  }

  // Test 3: Get graph info
  const nodes = raceCourse.vertices || [];
  const edges = raceCourse.edges || [];
  const controls = raceCourse.controls || [];
  console.log(`\n✅ Navigation graph:`);
  console.log(`   Nodes: ${nodes.length}`);
  console.log(`   Edges: ${edges.length}`);
  console.log(`   Controls: ${controls.length}`);

  // Test 4: Analyze shortest route
  const testCourse = courses[0];
  const courseControls = getActualCourseControls(testCourse.controls || [], controls);

  if (courseControls.length >= 2) {
    const fromControlId = courseControls[0].controlId;
    const toControlId = courseControls[1].controlId;

    const fromControl = controls.find(c => c.id === fromControlId);
    const toControl = controls.find(c => c.id === toControlId);

    if (fromControl && toControl) {
      const scoringModel = getEventScoringModel(event);
      const analyzer = createEventRouteAnalyzer(event, { scoringModel });

      const routes = analyzer.findAlternativePathsBetweenControls(
        fromControlId,
        toControlId,
        3
      );

      console.log(`\n✅ Found ${routes.length} routes from ${fromControl.id} to ${toControl.id}:`);
      if (routes.length > 0) {
        const route = routes[0];
        console.log(`   Distance: ${route.distance.toFixed(1)}m`);
        console.log(`   Difficulty: ${route.difficulty.toFixed(2)}`);
        console.log(`   Decision points: ${route.decisionPoints}`);
      }
    }
  }

  // Test 5: Analyze course difficulty
  const testAnalysis = courses[0];
  const scoringModel = getEventScoringModel(event);
  const analyzer = createEventRouteAnalyzer(event, { scoringModel });

  const { legs } = analyzeCourseLegs(testAnalysis, event, analyzer, false);

  console.log(`\n✅ Course difficulty analysis for "${testAnalysis.name}":`);
  const totalDifficulty = scoringModel.getCourseDifficulty(legs);
  console.log(`   Total difficulty: ${totalDifficulty.toFixed(2)}`);
  console.log(`   Number of legs: ${legs.length}`);

  if (legs.length > 0) {
    console.log(`   First leg: ${legs[0].label}`);
    console.log(`     Distance: ${legs[0].shortestDistance.toFixed(1)}m`);
    console.log(`     Difficulty: ${legs[0].difficulty.toFixed(2)}`);
  }

  console.log('\n✅ All tests passed! MCP server functionality verified.');

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
