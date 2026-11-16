import assert from "node:assert/strict";
import { isTechnicalMessage } from "../src/lib/userError";
import { plainSendFailure, UNCERTAIN_SEND_MESSAGE } from "../src/lib/sendFailure";

// Microsoft's wording carries a request-id and a URL; none of that may reach the TA.
const graph = (status: number) =>
  `Microsoft Graph draft send from shihab@career141.com returned ${status}: {"error":{"code":"x","innerError":{"request-id":"abc","date":"2026-11-16"}}} https://learn.microsoft.com`;

for (const status of [401, 403, 404, 413, 429, 400]) {
  const f = plainSendFailure(graph(status));
  assert.equal(f.state, "not_sent", `${status} was answered, so nothing was sent`);
  assert.match(f.message, /Nothing was sent\./);
  assert.ok(!isTechnicalMessage(f.message), `${status}: no technical text on screen`);
  assert.ok(!/do not send it again/i.test(f.message), `${status}: a refusal must not tell the TA to wait`);
}
assert.match(plainSendFailure(graph(403)).message, /mailbox permission/);
assert.match(plainSendFailure(graph(429)).message, /few minutes/);

// A Microsoft outage or a connection that dropped may have sent it: never invite a second send.
for (const raw of [graph(500), graph(503), "Microsoft Graph could not be reached: The operation was aborted due to timeout"]) {
  const f = plainSendFailure(raw);
  assert.equal(f.state, "uncertain");
  assert.equal(f.message, UNCERTAIN_SEND_MESSAGE);
}

assert.equal(plainSendFailure("Microsoft Graph sign-in failed: bad secret").state, "not_sent");
assert.match(plainSendFailure("Microsoft Graph credentials are not configured (MS_TENANT_ID)").message, /mail connection/);
// A plain sentence from the outbound lock goes through; an unreadable one is replaced.
assert.match(plainSendFailure("Held back by the outbound lock.").message, /^Held back by the outbound lock\. Nothing was sent\./);
assert.match(plainSendFailure("<html>Bad gateway</html>").message, /Microsoft refused the email/);
assert.match(plainSendFailure("").message, /Nothing was sent\./);

console.log("sendFailure ok");
