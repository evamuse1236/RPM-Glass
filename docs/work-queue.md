# Work queue

The RPM Glass page in Notion (HQ) holds this project's health and work cards. Agents never edit it by hand.

- At session start, run `hq check rpm-glass` and read the problems it reports.
- Pick work: `hq next rpm-glass`, then `hq claim <ref> --agent "<name>"`. Exit 3 means Up next is empty; ask Vishwajit.
- Update cards only with `hq note`, `hq ask` (a decision for Vishwajit), `hq comments` and `hq done`, in plain words without paths or PR numbers.
- After you ship a change, run `hq check rpm-glass` again. Details: `hq --help` and Orchy `docs/project-dashboards.md`.
