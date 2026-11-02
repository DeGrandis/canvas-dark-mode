# Testing without a Canvas account

These load the real extension into Chromium. Nothing here ships: the release workflow
only zips `plugin/`.

```bash
cd tests
npm install
npx playwright install chromium
```

## What to run

| Command | What it does |
| --- | --- |
| `npm run check` | Pass or fail regression checks. Real InstUI components at the version Canvas pins, plus nav checks on a live public page. Run this on every change. |
| `npm run schools` | Opens the real login page of every school in the manifest, with its real colours, and reports text under 3:1. Run this after a theme change. |
| `npm run audit` | Audits real public course pages listed in `targets.json`: home, modules, assignments, syllabus, quizzes and content pages. |

`node checks.mjs` without `--live` needs no network. Add `--ext <dir>` to any of these
to test another copy of the extension, such as a checkout of `master`, and `--label <name>`
to the audit to keep its results apart. Results and screenshots land in `tests/out/`.

## What this cannot reach

Gradebook, Dashboard, Calendar, Inbox, SpeedGrader and New Quizzes sit behind a login, so
for those use a free [Canvas Lite](https://www.instructure.com/try-canvas) account:

```bash
node audit.mjs --login https://your-school.instructure.com
```

Sign in, close the window, then list the pages to check in a file:

```json
{
  "dashboard": "https://your-school.instructure.com/",
  "gradebook": "https://your-school.instructure.com/courses/1/gradebook"
}
```

```bash
node audit.mjs --authed pages.json --label signed-in
```

The profile stays in `tests/out/.profile`, which is ignored by git.

## Adding a school

Check it really is Canvas before adding it. The extension restyles every page it matches.

```bash
curl -sI https://canvas.example.edu/login/canvas | grep -i x-canvas-meta
```

Hosts under `*.instructure.com` are already covered.

## Finding a selector

InstUI generated class names look like `css-1a2b3c-textInput__facade`. The hash changes
when Canvas deploys but the label after it does not, so select on `[class*="-textInput__facade"]`.
Never select on the hash, or on the older `fLzZc_caGd` style of name.

School themes come from `https://<host>/api/v1/brand_variables`, which needs no login.
