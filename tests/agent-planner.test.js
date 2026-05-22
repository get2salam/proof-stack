import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, evaluateStep, createPlanCheckpoint, advanceCheckpoint } from '../js/agent-planner.js';

describe('buildPlan', () => {
  it('returns empty plan for empty array', () => {
    const plan = buildPlan([]);
    assert.equal(plan.actions.length, 0);
    assert.equal(plan.confidence, 0);
    assert.equal(typeof plan.summary, 'string');
  });

  it('returns empty plan for non-array input', () => {
    const plan = buildPlan(null);
    assert.equal(plan.actions.length, 0);
  });

  it('ranks stale low-trust item above recently-reviewed high-trust item', () => {
    const items = [
      { id: 'a', title: 'Strong asset', state: 'Published', metric: 9, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'Neglected asset', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Screenshot' },
    ];
    const plan = buildPlan(items);
    assert.equal(plan.actions[0].id, 'b');
  });

  it('caps actions at 5 regardless of input size', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`, title: `Item ${i}`, state: 'Collected',
      metric: 5, date: '2025-06-01', category: 'Outcome',
    }));
    assert.ok(buildPlan(items).actions.length <= 5);
  });

  it('sets targetState to the next state in the advance order', () => {
    const items = [{ id: 'x', title: 'X', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' }];
    const plan = buildPlan(items);
    assert.equal(plan.actions[0].targetState, 'Curated');
  });

  it('keeps Published items at Published as targetState', () => {
    const items = [{ id: 'y', title: 'Y', state: 'Published', metric: 5, date: '2026-05-01', category: 'Outcome' }];
    const plan = buildPlan(items);
    assert.equal(plan.actions[0].targetState, 'Published');
  });

  it('flags categories with fewer than 2 assets as gaps', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Ready', metric: 7, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Ready', metric: 7, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    assert.ok(plan.gaps.includes('Quote'));
    assert.ok(plan.gaps.includes('Outcome'));
  });

  it('does not flag a category with 2+ assets as a gap', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Curated', metric: 6, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2026-05-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    assert.ok(!plan.gaps.includes('Quote'));
  });

  it('includes a non-empty summary string', () => {
    const items = [{ id: 'a', title: 'A', state: 'Curated', metric: 6, date: '2026-05-01', category: 'Quote' }];
    const plan = buildPlan(items);
    assert.ok(plan.summary.length > 0);
  });
});

describe('evaluateStep', () => {
  it('passes when item state matches expected', () => {
    const result = evaluateStep({ id: 'x', state: 'Curated' }, 'Curated');
    assert.equal(result.passed, true);
    assert.ok(result.reason.includes('Curated'));
  });

  it('fails when item state does not match expected', () => {
    const result = evaluateStep({ id: 'x', state: 'Collected' }, 'Curated');
    assert.equal(result.passed, false);
    assert.equal(result.expected, 'Curated');
    assert.equal(result.actual, 'Collected');
  });

  it('handles null item gracefully', () => {
    const result = evaluateStep(null, 'Ready');
    assert.equal(result.passed, false);
    assert.equal(result.id, null);
    assert.equal(result.actual, null);
  });

  it('includes structured fields for audit trail', () => {
    const result = evaluateStep({ id: 'z', state: 'Ready' }, 'Ready');
    assert.ok('id' in result && 'expected' in result && 'actual' in result && 'passed' in result && 'reason' in result);
  });
});

describe('createPlanCheckpoint', () => {
  it('initializes checkpoint from a built plan', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const checkpoint = createPlanCheckpoint(plan);
    assert.equal(checkpoint.stepIndex, 0);
    assert.equal(checkpoint.totalSteps, plan.actions.length);
    assert.equal(checkpoint.passCount, 0);
    assert.equal(checkpoint.baselineConfidence, plan.confidence);
  });

  it('handles null plan gracefully', () => {
    const checkpoint = createPlanCheckpoint(null);
    assert.equal(checkpoint.stepIndex, 0);
    assert.equal(checkpoint.totalSteps, 0);
  });

  it('includes actions array for agent reference', () => {
    const items = [{ id: 'x', title: 'X', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' }];
    const plan = buildPlan(items);
    const checkpoint = createPlanCheckpoint(plan);
    assert.ok(Array.isArray(checkpoint.actions));
    assert.ok(checkpoint.actions.length > 0);
  });
});

describe('advanceCheckpoint', () => {
  it('increments step index on each advance', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    let checkpoint = createPlanCheckpoint(plan);
    const eval1 = evaluateStep({ id: 'a', state: 'Curated' }, 'Curated');
    checkpoint = advanceCheckpoint(checkpoint, eval1);
    assert.equal(checkpoint.stepIndex, 1);
  });

  it('tracks pass count as steps are evaluated', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    let checkpoint = createPlanCheckpoint(plan);
    const passEval = { passed: true };
    const failEval = { passed: false };
    checkpoint = advanceCheckpoint(checkpoint, passEval);
    assert.equal(checkpoint.passCount, 1);
    checkpoint = advanceCheckpoint(checkpoint, failEval);
    assert.equal(checkpoint.passCount, 1);
  });

  it('updates confidence based on pass rate', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    let checkpoint = createPlanCheckpoint(plan);
    const passEval = { passed: true };
    checkpoint = advanceCheckpoint(checkpoint, passEval);
    assert.ok(checkpoint.updatedConfidence <= checkpoint.baselineConfidence);
    assert.ok(checkpoint.updatedConfidence > 0);
  });

  it('records passed/failed steps in order', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    let checkpoint = createPlanCheckpoint(plan);
    checkpoint = advanceCheckpoint(checkpoint, { passed: true });
    checkpoint = advanceCheckpoint(checkpoint, { passed: false });
    assert.deepEqual(checkpoint.passed, [true, false]);
  });

  it('clamps step index to total steps', () => {
    const items = [{ id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' }];
    const plan = buildPlan(items);
    let checkpoint = createPlanCheckpoint(plan);
    checkpoint = advanceCheckpoint(checkpoint, { passed: true });
    checkpoint = advanceCheckpoint(checkpoint, { passed: false });
    checkpoint = advanceCheckpoint(checkpoint, { passed: true });
    assert.ok(checkpoint.stepIndex <= checkpoint.totalSteps);
  });
});
