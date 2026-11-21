[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/aan314183/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/aan314183/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121 — a faster drop-in for csv-reader 1.0.0

A dependency-free ES module (`solve.js`) whose `run(input)` returns exactly
what make.fun's csv-reader 1.0.0 returns for `{text, header}` — the JSON
`{columns, rows, errors}` — for every broken CSV the competition draws,
including BOM, CRLF/LF line breaks, lone CRs, quoted fields with doubled
quotes and embedded line breaks, junk after a closing quote, unterminated
quotes, and short/long rows. `main.ts` is the harness driver: it reads every
case from `/input/cases.json`, answers each one alone with `run`, and writes
`/output/answers.json`.

## How it is fast

One left-to-right pass. Records without a quote or a stray CR are split
with `indexOf` jumps straight to the next comma or line break, and a
monotonic next-CR cursor keeps every CR search to a single pass over the
text (CRs are sparse, so an unbounded `indexOf('\r')` from every field
would rescan the same stretch thousands of times). Quoted fields are
handled field by field, with `""` collapsing and CR/LF normalisation only
when the field actually holds them.

## Local check

On the kit's practice set (6 cases, ~10.5 MB of CSV) this entry answers
6/6 identically to the reference and runs its `solve.js` in ~0.16 s
against the house baseline's ~0.46–0.70 s on the same machine.

```sh
node --no-incremental-marking main.ts  # with MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR set
```

## License

MIT — see [LICENSE](LICENSE).
