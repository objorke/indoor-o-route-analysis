# Generate Training Data CLI

Command-line tool that processes event JSON files to generate training data for the indoor orienteering training app.

The exported routes match the web app's **"Show all routes"** view: every distinct
stair/label sequence per leg (capped per leg by `--k`, default 50).

## Usage

```bash
pnpm start [fileFilter] [inputFolder] [outputFolder] [--k <n>] [--verbose]
```

### Arguments

| Argument       | Default                                        | Description                                          |
| -------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `fileFilter`   | (none)                                         | Only process files containing this string            |
| `inputFolder`  | `../../test-data/events`                       | Folder containing event JSON files                   |
| `outputFolder` | `../../output/training-data`                   | Folder for output training JSON files                |
| `--k <n>`      | `50`                                           | Max routes (per-leg cap) for the route enumeration   |
| `--verbose`    | (off)                                          | Print number of routes found for each leg            |

### Examples

```bash
# Process all files with defaults
pnpm start

# Process only 2026 files with verbose output
pnpm start 2026 --verbose

# Custom folders with 50 max paths
pnpm start "" ./input ./output --k 50

# Custom folders with 50 max paths
pnpm start "" ../../test-data/events ../../../indoor-o-training-v0/public/examples
```

## Output

Output files are named with a "-training" suffix (e.g., `event.json` → `event-training.json`).

Each run overwrites the files directly in the output folder (default
`output/training-data/`), and additionally leaves an untouched copy in a
timestamped subfolder named `yyyy-mm-dd_hhMM` (same convention as
analyse-all-cli):

```
output/training-data/
  event-training.json      <- latest run
  generation-report.json   <- route counts and timing per leg/course/event
  generation-report.md     <- human-readable report
  2026-07-07_0915/         <- untouched copy of that run's files
```
