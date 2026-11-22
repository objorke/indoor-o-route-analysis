# Indoor Orienteering Route Analysis - MCP Server

This is a Model Context Protocol (MCP) server that exposes the indoor orienteering route analysis functionality for use with AI assistants like Claude.

## Features

The MCP server provides the following capabilities:

- **Load Events**: Import event data from JSON files
- **Course Information**: Query courses, controls, and class assignments
- **Graph Analysis**: Inspect the navigation graph (nodes, edges, polygons)
- **Route Analysis**: Find shortest routes between controls with alternatives
- **Difficulty Analysis**: Analyze course difficulty with configurable scoring models

## Installation

The MCP server uses the same dependencies as the main web application. Install dependencies from the root directory:

```bash
npm install
```

## Running the Server

The MCP server can be run directly using `tsx`:

```bash
npx tsx mcp-server/index.ts
```

Or add it to your MCP client configuration (e.g., Claude Desktop):

### Claude Desktop Configuration

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "indoor-o-route-analysis": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/indoor-o-route-analysis-v0/mcp-server/index.ts"
      ]
    }
  }
}
```

Replace `/absolute/path/to/` with the actual path to your repository.

## Available Tools

### 1. load_event

Load an event from a JSON file into context. **Must be called before using other analysis tools.**

**Parameters:**
- `file_path` (string, required): Absolute path to the event JSON file

**Example:**
```
Load the event from /home/user/events/2026-02-01 OK Moss indoor challenge.json
```

### 2. get_event_info

Get information about the currently loaded event including name, date, and number of courses.

**Parameters:** None

**Example:**
```
What event is currently loaded?
```

### 3. list_courses

List all courses in the current event with their names and number of controls.

**Parameters:** None

**Example:**
```
Show me all the courses in this event
```

### 4. get_course_details

Get detailed information about a specific course including all controls in order.

**Parameters:**
- `course_name` (string, required): Name of the course

**Example:**
```
Show me the details for "Løype 4"
```

### 5. list_classes

List all classes (categories) in the event and their assigned courses.

**Parameters:** None

**Example:**
```
What classes are in this event?
```

### 6. get_graph_info

Get information about the navigation graph including number of nodes, edges, and polygons.

**Parameters:** None

**Example:**
```
Tell me about the navigation graph
```

### 7. analyze_shortest_route

Find the shortest route between two controls and analyze its properties.

**Parameters:**
- `from_control` (string, required): Control code to start from (e.g., '31', 'S1')
- `to_control` (string, required): Control code to navigate to (e.g., '42', 'F1')
- `max_alternatives` (number, optional): Maximum number of alternative routes to find (default: 3)

**Example:**
```
What is the shortest route from control 42 to control 52?
Find 5 alternative routes from S1 to 31
```

### 8. analyze_course_difficulty

Analyze the difficulty of an entire course, providing leg-by-leg breakdown and total difficulty score.

**Parameters:**
- `course_name` (string, required): Name of the course to analyze
- `scoring_model` (string, optional): Scoring model to use (e.g., 'alpha@0.1', 'basic@0.1')

**Example:**
```
Analyze the difficulty of "Løype 4"
What's the difficulty breakdown for "Bana 1" using the alpha@0.1 scoring model?
```

## Example Usage Session

Here's a complete example conversation with the MCP server:

```
User: Load the event from /path/to/test-data/events/2026-02-01 OK Moss indoor challenge.json
Assistant: ✅ Loaded event: OK Moss indoor challenge
Date: 2026-02-01
Courses: 4

User: Show me all courses

Assistant: Courses:
1. Løype 4 (25 controls)
2. Løype 3 (20 controls)

User: Analyze the difficulty of 'Løype 4'

Assistant: Overall Difficulty: 45.2 (Medium)
Total Distance: 1250m
Total Climb: 45m
Number of Legs: 24

Leg-by-leg breakdown:
  S1 → 42: 52.3m, difficulty 1.5 (Easy)
  42 → 52: 68.1m, difficulty 2.1 (Medium)
  ...
"```

## Advanced Example Prompts

### Comparative Analysis
```
Compare the difficulty of all courses in the event
Which course has the most stairs?
What's the average difficulty per leg across all courses?
```

### Route Finding
```
Find the shortest route from S1 to 42
Show me 5 alternative routes from control 31 to 45
Which route between 42 and 52 has the fewest decision points?
```

### Graph Exploration
```
How many one-way edges are in the graph?
Tell me about the navigation graph structure
What's the ratio of stairs to regular edges?
```

### Course Design
```
Which leg in 'Løype 4' is the most difficult?
What makes leg 'S1 → 42' difficult?
Analyze all courses and rank them by difficulty
```

## Technical Details

### Data Format

The MCP server expects event files in the Indoor-O JSON format with:
- Event metadata (name, date, country)
- Race courses with courses, controls, maps
- Navigation graph (vertices, edges, polygons)
- Optional class assignments

### Scoring Models

The server supports multiple scoring models for difficulty calculation:
- `alpha@0.1` - Alpha model version 0.1

Each model weighs factors like:
- One-way edges
- Alternative route choices
- Stairs and level changes
- Decision points

### Route Analysis

The route analyzer uses:
- **Dijkstra's algorithm** for shortest path finding
- **Decision point detection** based on branch distances
- **Difficulty scoring** using configurable models
- **Alternative route finding** with customizable limits

## Troubleshooting

### Server Won't Start

1. Ensure dependencies are installed: `npm install`
2. Check that tsx is available: `npx tsx --version`
3. Verify the path in your MCP client config is absolute

### Tools Not Working

1. Always load an event first with `load_event`
2. Use exact course names (case-sensitive)
3. Use control codes (e.g., '42') not control IDs

### Event Won't Load

1. Verify the JSON file exists and is valid
2. Ensure the file follows the Indoor-O format
3. Check that the path is absolute

## Contributing

This MCP server reuses the core analysis functionality from the web application. To add new features:

1. Add analysis functions to `lib/` if needed
2. Expose new tools in `mcp-server/index.ts`
3. Document the tools in this README

## License

See the main repository LICENSE file.

