import assert from "node:assert/strict";
import test from "node:test";
import {
  edgeKey,
  expandOrthogonalPath,
  key,
  manhattan,
  parseKey,
  segmentsIntersect,
  shareEndpoint,
  traceEdges
} from "../src/features/routing/routingGeometry.ts";

test("key/parseKey roundtrip", () => {
  assert.equal(key(3, 7), "3,7");
  assert.deepEqual(parseKey("3,7"), [3, 7]);
  assert.deepEqual(parseKey("-1,0"), [-1, 0]);
});

test("edgeKey is order-independent", () => {
  assert.equal(edgeKey([1, 2], [3, 4]), edgeKey([3, 4], [1, 2]));
  assert.equal(edgeKey([0, 0], [1, 1]), "0,0|1,1");
});

test("traceEdges pairs consecutive points", () => {
  assert.deepEqual(traceEdges([[0, 0], [1, 0], [1, 1]]), ["0,0|1,0", "1,0|1,1"]);
  assert.deepEqual(traceEdges([[0, 0]]), []);
});

for (const [a, b, expected] of [
  [[0, 0], [5, 0], 5],
  [[0, 0], [0, 5], 5],
  [[0, 0], [0, 0], 0],
  [[2, 3], [5, 1], 5],
  [[-1, -2], [3, 4], 10],
  [[10, 10], [10, 7], 3],
  [[0, 9], [4, 0], 13]
] as Array<[[number, number], [number, number], number]>) {
  test(`manhattan ${JSON.stringify(a)} ${JSON.stringify(b)} = ${expected}`, () => {
    assert.equal(manhattan(a, b), expected);
  });
}

for (const [a, b, expected] of [
  [[0, 0], [0, 4], 5],
  [[0, 0], [4, 4], 2],
  [[1, 1], [2, 2], 2],
  [[0, 0], [0, 0], 1],
  [[3, 3], [0, 0], 2]
] as Array<[[number, number], [number, number], number]>) {
  test(`expandOrthogonalPath ${JSON.stringify(a)}->${JSON.stringify(b)} has ${expected} points`, () => {
    assert.equal(expandOrthogonalPath([a, b]).length, expected);
  });
}

test("expandOrthogonalPath keeps diagonal jumps as-is", () => {
  assert.deepEqual(expandOrthogonalPath([[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
});

test("expandOrthogonalPath fills intermediate points of straight runs", () => {
  assert.deepEqual(expandOrthogonalPath([[0, 0], [0, 2]]), [[0, 0], [0, 1], [0, 2]]);
});

for (const [a1, a2, b1, b2, expected] of [
  [[0, 0], [4, 0], [2, -1], [2, 1], true],
  [[0, 0], [4, 0], [5, 1], [5, 3], false],
  [[0, 0], [4, 4], [0, 4], [4, 0], true],
  [[0, 0], [4, 0], [1, 0], [3, 0], true],
  [[0, 0], [4, 0], [4, 0], [8, 0], true],
  [[0, 0], [4, 0], [6, 0], [9, 0], false],
  [[0, 0], [4, 0], [0, 2], [4, 2], false],
  [[0, 0], [0, 4], [1, 1], [3, 1], false],
  [[2, 2], [2, 6], [2, 0], [2, 8], true],
  [[2, 2], [2, 6], [2, 2], [2, 6], true],
  [[0, 0], [2, 2], [2, 0], [0, 2], true],
  [[0, 0], [1, 1], [2, 0], [3, 1], false]
] as Array<[[number, number], [number, number], [number, number], [number, number], boolean]>) {
  test(`segmentsIntersect ${JSON.stringify([a1, a2])} x ${JSON.stringify([b1, b2])} = ${expected}`, () => {
    assert.equal(segmentsIntersect(a1, a2, b1, b2), expected);
  });
}

for (const [a1, a2, b1, b2, expected] of [
  [[0, 0], [4, 0], [4, 0], [4, 4], true],
  [[0, 0], [4, 0], [0, 0], [0, 4], true],
  [[0, 0], [4, 0], [2, 0], [2, 4], false],
  [[0, 0], [4, 0], [5, 0], [5, 4], false]
] as Array<[[number, number], [number, number], [number, number], [number, number], boolean]>) {
  test(`shareEndpoint ${JSON.stringify([a1, a2])} x ${JSON.stringify([b1, b2])} = ${expected}`, () => {
    assert.equal(shareEndpoint(a1, a2, b1, b2), expected);
  });
}
