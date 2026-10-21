import assert from "node:assert/strict";
import worker from "./index.mjs";

for (const [source, expected] of [
  ["https://www.portuguesewithines.com/", "https://portuguesewithines.com/"],
  ["http://www.portuguesewithines.com/book/", "https://portuguesewithines.com/book/"],
  ["http://www.portuguescomaines.com/", "https://portuguesewithines.com/"],
  [
    "https://www.portuguescomaines.com/book/?view=book",
    "https://portuguesewithines.com/book/?view=book"
  ],
  [
    "https://www.portuguesewithines.com/booking-terms/?from=footer",
    "https://portuguesewithines.com/booking-terms/?from=footer"
  ]
]) {
  const response = worker.fetch(new Request(source));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), expected);
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
}

console.log("5 www redirect tests passed.");
