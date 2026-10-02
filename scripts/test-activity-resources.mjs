import assert from "node:assert/strict";

import {
  getSafeSubmissionUrl,
  isSubmissionBeforeDeadline,
  parseEventDateTime,
} from "../lib/activity-resources.ts";

assert.equal(
  parseEventDateTime("2026-10-20 15:30")?.toISOString(),
  "2026-10-20T21:30:00.000Z",
);
assert.equal(parseEventDateTime("20/10/2026 15:30"), null);
assert.equal(
  isSubmissionBeforeDeadline(
    "2026-10-20 15:30",
    new Date("2026-10-20T21:29:59.000Z"),
  ),
  true,
);
assert.equal(
  isSubmissionBeforeDeadline(
    "2026-10-20 15:30",
    new Date("2026-10-20T21:30:00.000Z"),
  ),
  false,
);
assert.equal(isSubmissionBeforeDeadline("fecha inválida"), false);
assert.equal(isSubmissionBeforeDeadline(undefined), true);
assert.equal(
  getSafeSubmissionUrl("https://forms.gle/example")?.hostname,
  "forms.gle",
);
assert.equal(
  getSafeSubmissionUrl("https://docs.google.com/forms/d/example/viewform")
    ?.hostname,
  "docs.google.com",
);
assert.equal(getSafeSubmissionUrl("http://forms.gle/example"), null);
assert.equal(getSafeSubmissionUrl("https://example.com/form"), null);

console.log(
  "Resource checks passed: event timezone, deadline boundary and allowed form hosts.",
);
