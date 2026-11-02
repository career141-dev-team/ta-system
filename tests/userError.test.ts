import assert from "node:assert/strict";
import { isTechnicalMessage, safeErrorMessage } from "../src/lib/userError";

const fallback = "That change could not be saved. Try again.";

assert.equal(
  safeErrorMessage(new Error("Only the TA Lead for this opening can approve this request."), fallback),
  "Only the TA Lead for this opening can approve this request.",
);
assert.equal(
  safeErrorMessage(
    new Error("Convex refused ta/openingAccess:approve: [Request ID: abc123] Server Error Uncaught Error: internal failure"),
    fallback,
  ),
  fallback,
);
assert.equal(safeErrorMessage(new Error("fetch failed: ECONNREFUSED https://api.example.test"), fallback), fallback);
assert.equal(safeErrorMessage(new Error("The backend answered HTTP 503"), fallback), fallback);
assert.equal(safeErrorMessage(new Error("C:\\server\\jobs.ts:42 failed"), fallback), fallback);
assert.equal(safeErrorMessage(new Error("Invalid API key: sk-example"), fallback), fallback);
assert.equal(safeErrorMessage(null, fallback), fallback);
assert.equal(isTechnicalMessage("Please choose an opening."), false);
assert.equal(isTechnicalMessage("Request ID: abc123"), true);

console.log("  ok  user-facing errors preserve useful instructions and hide technical details");

// 2 Nov: a code in front is engineering text; the CV reader's own errors never reach the screen.
assert.equal(safeErrorMessage(new Error("[403] Access denied. Your role (ta) cannot do this."), "Fallback."), "Fallback.");
assert.equal(safeErrorMessage(new Error("Uncaught Error: Your workday has not started today. Open Today's Checks and start it, then try again."), "x"), "Your workday has not started today. Open Today's Checks and start it, then try again.");
import { friendlyUploadError } from "../convex/lib/cvUploadProgress";
assert.match(friendlyUploadError("File URL not found (neither R2 nor Convex storage)"), /stored file is gone/);
assert.match(friendlyUploadError("Process interrupted or timed out (>10m)"), /timed out/);
assert.match(friendlyUploadError("CV extraction safety guard tripped"), /read safely/);
assert.doesNotMatch(friendlyUploadError("LLM failed to extract candidate data (API timeout)"), /LLM|API/);
assert.doesNotMatch(friendlyUploadError(undefined), /undefined/);
