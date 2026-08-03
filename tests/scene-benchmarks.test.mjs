import assert from "node:assert/strict";
import test from "node:test";
import { createStarterScene } from "../lib/starter-scene.ts";
import { SCENE_BENCHMARKS, runSceneBenchmark } from "../lib/scene-benchmarks.ts";

test("prompt/scene benchmarks are bilingual, deterministic, and quality-gated", () => {
  const scene = createStarterScene();
  assert.equal(SCENE_BENCHMARKS.length, 4);

  for (const benchmark of SCENE_BENCHMARKS) {
    assert.ok(benchmark.prompt.zh.length > 10, `${benchmark.id} needs a Chinese prompt`);
    assert.ok(benchmark.prompt.en.length > 10, `${benchmark.id} needs an English prompt`);
    assert.ok(benchmark.expectedOperationKinds.length > 0);
    const first = runSceneBenchmark(benchmark, scene);
    const second = runSceneBenchmark(benchmark, scene);

    assert.deepEqual(first.operations, second.operations, `${benchmark.id} operations must be reproducible`);
    assert.deepEqual(first.finalScene, second.finalScene, `${benchmark.id} final scene must be reproducible`);
    assert.deepEqual(first.diff, second.diff, `${benchmark.id} diff must be reproducible`);
    assert.deepEqual(
      first.operations.map((operation) => operation.op),
      benchmark.expectedOperationKinds,
      `${benchmark.id} operation contract changed`,
    );
    assert.ok(first.quality.status !== "fail", `${benchmark.id} should not fail the quality gate`);
    assert.ok(first.quality.score >= benchmark.minQualityScore, `${benchmark.id} quality score regressed`);
  }
});

test("quality-repair benchmark records deterministic repair operations", () => {
  const benchmark = SCENE_BENCHMARKS.find((item) => item.id === "quality-repair");
  assert.ok(benchmark);
  const result = runSceneBenchmark(benchmark, createStarterScene());
  assert.deepEqual(result.repair.repairCodes.sort(), ["no-authored-light", "transparent-material"]);
  assert.ok(result.repair.operations.some((operation) => operation.op === "add_node"));
  assert.ok(result.repair.operations.some((operation) => operation.op === "patch_node"));
  assert.ok(result.diff.entries.some((entry) => entry.ref === "node:quality-key-light"));
});
