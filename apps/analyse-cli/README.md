# Analyse CLI

Command-line tool for indoor orienteering route analysis: shortest paths
between controls, leg-by-leg course analysis, and difficulty scoring, using
the same algorithms as the web app.

## Usage

```bash
pnpm analyse <file> shortest-path --from <id> --to <id> [options]
pnpm analyse <file> analyze-course --course <name> [options]
pnpm analyse <file> analyze-all [options]
```

`<file>` is an event JSON or IOF XML file.

### Commands

| Command          | Description                                        |
| ----------------- | --------------------------------------------------- |
| `shortest-path`   | Find the shortest path between two controls/nodes    |
| `analyze-course`  | Analyze a specific course, leg by leg                |
| `analyze-all`     | Analyze all courses in the event                     |

### Options

| Option                       | Default      | Description                                       |
| ----------------------------- | ------------- | --------------------------------------------------- |
| `--format json\|csv`          | `json`        | Output format                                      |
| `--scoring-model <id>`        | `alpha@0.1`   | Scoring model ID                                   |
| `--from <id>`                 |               | Start control ID (`shortest-path`)                  |
| `--to <id>`                   |               | End control ID (`shortest-path`)                    |
| `--algorithm shortest\|human` | `shortest`    | Path-finding algorithm (`shortest-path`) — see below |
| `--course <name>`             |               | Course name (`analyze-course`)                     |
| `--help`                      |               | Show help                                          |

### Examples

```bash
pnpm analyse event.json shortest-path --from S1 --to 31
pnpm analyse event.json shortest-path --from S1 --to 31 --algorithm human
pnpm analyse event.json analyze-course --course "Course A" --format csv
pnpm analyse event.xml analyze-all --format csv --scoring-model alpha@0.1
```

## Output

- `shortest-path` — best route's path, description, distance, difficulty
  (score and category), decision points, alternative edges, and total climb.
  With `--algorithm human`, also includes `sameFloor`, a `narration` array
  (the step-by-step "how a runner would plan this" trace, same phrasing as
  the web app's Human Thinking lab), and the cognitive-effort metrics
  `mentalSteps`, `planDepth`, `cognitiveEffortScore`, `humanOptimalGap` (route
  length vs. the true shortest route — a large gap flags a potential "bait"
  leg). `--algorithm human` only accepts control IDs for `--from`/`--to`
  (unlike the default algorithm, which also accepts raw graph node IDs). It
  finds a route whenever one exists, including legs that need an unlabeled
  one-way passage, which shows as `→` in the label sequence.
- `analyze-course` — course totals (leg count, distance, max/average
  difficulty, target difficulty) plus per-leg detail (distance, difficulty,
  decision points, alternative edges, best route description).
- `analyze-all` — one summary row per course (leg count, distance, max/average
  difficulty, target difficulty).

Each command supports `--format json` (full detail) or `--format csv`
(tabular, suited for spreadsheets).
