# Analyse All CLI

Command-line tool that analyzes route difficulties across all event files and exports CSV, JSONL, and Excel reports.

## Usage

```bash
pnpm analyse-all [inputFolder] [outputFolder] [fileFilter] [flags]
```

### Arguments

| Argument       | Default                    | Description                                |
| -------------- | --------------------------- | ------------------------------------------ |
| `inputFolder`  | `../../test-data/events`    | Folder containing event JSON files         |
| `outputFolder` | `../../output/route-analysis` | Folder for output CSV, JSONL, and Excel reports |
| `fileFilter`   | (none)                      | Only process files containing this string  |

### Flags

| Flag          | Default | Description                                                                                 |
| ------------- | ------- | ------------------------------------------------------------------------------------------- |
| `--speed=N`   | `3.0`   | Running speed in m/s, used to compute the estimated running time.                           |
| `--max-leg`   | off     | For each event, scan every pair of existing controls to find the single hardest possible leg (the "Labs" search) and report it per course. **Slow** — cost grows with the square of the control count. |

### Examples

```bash
# Analyze all example files with defaults
pnpm analyse-all

# Analyze only 2026 files
pnpm analyse-all ../../test-data/events ../../output/route-analysis 2026

# Include the maximum-difficulty leg scan at a 3.5 m/s pace
pnpm analyse-all ../../test-data/events ../../output/route-analysis 2026 --max-leg --speed=3.5
```

## Output

Each run overwrites the report files directly in the output folder, and
additionally leaves an untouched copy in a timestamped subfolder named
`yyyy-mm-dd_hhMM` (e.g. `output/route-analysis/2026-07-06_1430/`), so past runs
remain available side by side. Each report is written as CSV, JSONL, and a
combined `route-analysis.xlsx` workbook (sheets: `events`, `courses`, `legs`).

- `events.csv` — one row per event: control count, course count, and (with `--max-leg`) the hardest possible leg between any two existing controls (e.g. `37-83`) and its difficulty, per model.
- `courses.csv` — per-course scores: the course's target difficulty category and value (as set in the Event view, if any), course length, estimated running time, and per model the max & average difficulty plus the hardest leg (label, route, length).
- `legs.csv` — per-leg scores, including the course's target difficulty category and value for reference. For each leg, both the **shortest route** and the **lowest-difficulty route** are reported (route name, length, and difficulty), along with the number of stairs, branching points, and decision points, and the per-model difficulty.
