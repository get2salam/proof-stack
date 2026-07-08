import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, evaluateStep, createPlanCheckpoint, advanceCheckpoint, runPlanLoop, summarizePlanRun, filterPlanActions, diffPlans, retryFailedActions, mergePlanRuns, planProgress, forecastConfidence, shouldAbortRun, compareSummaries, findChronicFailures, scorePlanReadiness } from '../js/agent-planner.js';

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

  it('skips malformed item entries instead of throwing', () => {
    const plan = buildPlan([
      null,
      'loose note',
      ['nested'],
      { id: 'valid', title: 'Valid proof', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
    ]);
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].id, 'valid');
    assert.deepEqual(plan.gaps, ['Quote']);
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

  it('produces finite urgency and confidence when item.date is unparseable', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: 'not-a-date', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    assert.ok(Number.isFinite(plan.actions[0].urgency), 'urgency must be finite for malformed date');
    assert.ok(Number.isFinite(plan.confidence), 'confidence must be finite for malformed date');
    assert.ok(!plan.summary.includes('NaN'), 'summary must not render NaN');
  });

  it('produces finite urgency when item.metric is non-numeric or NaN', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 'high', date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: NaN, date: '2026-05-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    assert.ok(plan.actions.every(a => Number.isFinite(a.urgency)));
    assert.ok(Number.isFinite(plan.confidence));
  });

  it('clamps out-of-range numeric metrics into the trust calculation', () => {
    const tooHigh = [{ id: 'h', title: 'H', state: 'Collected', metric: 999, date: '2026-05-01', category: 'Quote' }];
    const tooLow = [{ id: 'l', title: 'L', state: 'Collected', metric: -50, date: '2026-05-01', category: 'Quote' }];
    assert.ok(Number.isFinite(buildPlan(tooHigh).actions[0].urgency));
    assert.ok(Number.isFinite(buildPlan(tooLow).actions[0].urgency));
  });

  it('treats an unrecognized item.state as the entry state instead of going off-scale', () => {
    const items = [
      { id: 'a', title: 'A', state: 'TypoState', metric: 5, date: '2026-05-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    assert.equal(plan.actions[0].targetState, 'Collected');
    assert.ok(Number.isFinite(plan.actions[0].urgency));
  });

  it('floors urgency at zero for a review date scheduled in the future instead of going negative', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Ready', metric: 9, date: '9999-06-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    assert.ok(plan.actions[0].urgency >= 0, 'a not-yet-due item must not carry negative urgency');
    assert.ok(plan.confidence <= 1, 'confidence must stay within [0, 1] when urgency is floored');
  });

  it('keeps confidence bounded when a far-future item is mixed with a genuinely overdue one', () => {
    const items = [
      { id: 'future', title: 'Scheduled for next year', state: 'Ready', metric: 9, date: '9999-06-01', category: 'Quote' },
      { id: 'overdue', title: 'Neglected asset', state: 'Collected', metric: 1, date: '2020-01-01', category: 'Screenshot' },
    ];
    const plan = buildPlan(items);
    assert.ok(plan.actions.every(a => a.urgency >= 0 && a.urgency <= 1));
    assert.ok(plan.confidence >= 0 && plan.confidence <= 1, `confidence ${plan.confidence} must stay within [0, 1]`);
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

describe('runPlanLoop', () => {
  it('returns invalid_plan for null input', () => {
    const result = runPlanLoop(null, []);
    assert.equal(result.halted, true);
    assert.equal(result.reason, 'invalid_plan');
    assert.equal(result.checkpoint, null);
  });

  it('completes with reason=completed when all steps pass', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    const advanced = items.map(item => {
      const action = plan.actions.find(a => a.id === item.id);
      return action ? { ...item, state: action.targetState } : item;
    });
    const result = runPlanLoop(plan, advanced);
    assert.equal(result.halted, false);
    assert.equal(result.reason, 'completed');
    assert.equal(result.log.length, plan.actions.length);
  });

  it('records step, action, and evaluation in each log entry', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const result = runPlanLoop(plan, items);
    assert.equal(result.log.length, plan.actions.length);
    const entry = result.log[0];
    assert.ok('step' in entry && 'action' in entry && 'evaluation' in entry);
  });

  it('ignores malformed execution items while keeping a structured failure log', () => {
    const plan = {
      actions: [{ rank: 1, id: 'missing', title: 'Missing proof', currentState: 'Collected', targetState: 'Curated', urgency: 0.8 }],
      gaps: [],
      confidence: 0.6,
      summary: 'manual plan',
    };
    const result = runPlanLoop(plan, [null, ['bad'], 'bad']);
    assert.equal(result.halted, false);
    assert.equal(result.log.length, 1);
    assert.equal(result.log[0].evaluation.id, null);
    assert.equal(result.log[0].evaluation.passed, false);
  });

  it('halts with reason=step_failed on first failure when haltOnFailure=true', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    const result = runPlanLoop(plan, items, { haltOnFailure: true });
    assert.equal(result.halted, true);
    assert.equal(result.reason, 'step_failed');
    assert.equal(result.log.length, 1);
  });

  it('halts with reason=max_steps_exceeded when maxSteps cap is reached', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`, title: `Item ${i}`, state: 'Collected',
      metric: 2, date: '2025-01-01', category: 'Quote',
    }));
    const plan = buildPlan(items);
    const result = runPlanLoop(plan, items, { maxSteps: 2 });
    assert.equal(result.halted, true);
    assert.equal(result.reason, 'max_steps_exceeded');
    assert.ok(result.log.length <= 2);
  });

  it('produces an audit summary via summarizePlanRun', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const result = runPlanLoop(plan, items);
    const summary = summarizePlanRun(result);
    assert.equal(summary.stepsRun, plan.actions.length);
    assert.equal(summary.passCount + summary.failCount, summary.stepsRun);
    assert.ok(summary.passRate >= 0 && summary.passRate <= 1);
    assert.ok(Array.isArray(summary.failedIds));
    assert.equal(summary.reason, 'completed');
  });

  it('final checkpoint stepIndex equals total steps after full run', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const advanced = items.map(item => {
      const action = plan.actions.find(a => a.id === item.id);
      return action ? { ...item, state: action.targetState } : item;
    });
    const result = runPlanLoop(plan, advanced);
    assert.equal(result.checkpoint.stepIndex, plan.actions.length);
    assert.equal(result.checkpoint.passed.length, plan.actions.length);
    assert.ok(result.checkpoint.passed.every(Boolean));
  });
});

describe('filterPlanActions', () => {
  it('returns empty plan-like object for null input', () => {
    const filtered = filterPlanActions(null, 0.5);
    assert.deepEqual(filtered.actions, []);
    assert.equal(filtered.confidence, 0);
  });

  it('keeps all actions when threshold is 0', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    assert.equal(filterPlanActions(plan, 0).actions.length, plan.actions.length);
  });

  it('drops actions below the urgency threshold and does not mutate input', () => {
    const items = [
      { id: 'stale', title: 'Stale', state: 'Collected', metric: 1, date: '2024-01-01', category: 'Quote' },
      { id: 'fresh', title: 'Fresh', state: 'Published', metric: 10, date: '2026-05-20', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const originalCount = plan.actions.length;
    const filtered = filterPlanActions(plan, 0.5);
    assert.ok(filtered.actions.every(a => a.urgency >= 0.5));
    assert.ok(filtered.actions.length < originalCount);
    assert.equal(plan.actions.length, originalCount);
  });
});

describe('diffPlans', () => {
  it('reports stable=true for identical plans', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const diff = diffPlans(plan, plan);
    assert.equal(diff.stable, true);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.reordered, []);
  });

  it('detects added and removed action ids', () => {
    const prev = { actions: [{ id: 'a' }, { id: 'b' }] };
    const next = { actions: [{ id: 'b' }, { id: 'c' }] };
    const diff = diffPlans(prev, next);
    assert.deepEqual(diff.added, ['c']);
    assert.deepEqual(diff.removed, ['a']);
    assert.equal(diff.stable, false);
  });

  it('detects reordered shared ids without flagging them as added/removed', () => {
    const prev = { actions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    const next = { actions: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] };
    const diff = diffPlans(prev, next);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
    assert.ok(diff.reordered.length > 0);
    assert.equal(diff.stable, false);
  });

  it('treats null/invalid plans as empty action lists', () => {
    const diff = diffPlans(null, { actions: [{ id: 'x' }] });
    assert.deepEqual(diff.added, ['x']);
    assert.deepEqual(diff.removed, []);
  });
});

describe('retryFailedActions', () => {
  it('returns empty plan-like object for null input', () => {
    const retry = retryFailedActions(null, { failedIds: ['a'] });
    assert.deepEqual(retry.actions, []);
    assert.equal(retry.confidence, 0);
  });

  it('returns no actions when summary has no failures', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Curated', metric: 6, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const retry = retryFailedActions(plan, { failedIds: [] });
    assert.equal(retry.actions.length, 0);
  });

  it('keeps only actions whose ids appear in failedIds and preserves order', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Outcome' },
      { id: 'c', title: 'C', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Screenshot' },
    ];
    const plan = buildPlan(items);
    const originalOrder = plan.actions.map(a => a.id);
    const retry = retryFailedActions(plan, { failedIds: ['c', 'a'] });
    const retryOrder = retry.actions.map(a => a.id);
    assert.deepEqual(retryOrder, originalOrder.filter(id => id === 'a' || id === 'c'));
    assert.equal(plan.actions.length, 3);
  });

  it('round-trips with summarizePlanRun to produce a retry-ready plan', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const summary = summarizePlanRun(runPlanLoop(plan, items));
    const retry = retryFailedActions(plan, summary);
    assert.equal(retry.actions.length, summary.failedIds.length);
    assert.ok(retry.actions.every(a => summary.failedIds.includes(a.id)));
  });
});

describe('mergePlanRuns', () => {
  it('returns invalid_runs for empty or non-array input', () => {
    const merged = mergePlanRuns([]);
    assert.equal(merged.reason, 'invalid_runs');
    assert.equal(merged.halted, true);
    assert.equal(merged.log.length, 0);
    assert.equal(mergePlanRuns(null).reason, 'invalid_runs');
  });

  it('concatenates logs from an original and retry run in order', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const firstRun = runPlanLoop(plan, items);
    const retryRun = runPlanLoop(retryFailedActions(plan, summarizePlanRun(firstRun)), items);
    const merged = mergePlanRuns([firstRun, retryRun]);
    assert.equal(merged.log.length, firstRun.log.length + retryRun.log.length);
    assert.equal(merged.reason, 'completed');
  });

  it('surfaces a non-completed reason when any merged run halted', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Quote' },
    ];
    const plan = buildPlan(items);
    const okRun = runPlanLoop(plan, items.map(i => ({ ...i, state: 'Curated' })));
    const haltedRun = runPlanLoop(plan, items, { haltOnFailure: true });
    const merged = mergePlanRuns([okRun, haltedRun]);
    assert.equal(merged.halted, true);
    assert.equal(merged.reason, 'step_failed');
  });
});

describe('planProgress', () => {
  it('returns zeroes for null or invalid checkpoint', () => {
    const progress = planProgress(null);
    assert.equal(progress.stepsCompleted, 0);
    assert.equal(progress.stepsRemaining, 0);
    assert.equal(progress.percentComplete, 0);
    assert.equal(progress.isComplete, false);
  });

  it('reports zero progress for a fresh checkpoint', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const checkpoint = createPlanCheckpoint(buildPlan(items));
    const progress = planProgress(checkpoint);
    assert.equal(progress.stepsCompleted, 0);
    assert.equal(progress.stepsRemaining, checkpoint.totalSteps);
    assert.equal(progress.passRate, 0);
    assert.equal(progress.isComplete, false);
  });

  it('reports partial progress and current pass rate mid-run', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    let checkpoint = createPlanCheckpoint(buildPlan(items));
    checkpoint = advanceCheckpoint(checkpoint, { passed: true });
    const progress = planProgress(checkpoint);
    assert.equal(progress.stepsCompleted, 1);
    assert.equal(progress.stepsRemaining, checkpoint.totalSteps - 1);
    assert.equal(progress.passRate, 1);
    assert.equal(progress.isComplete, false);
  });

  it('flips to isComplete=true once every step has advanced', () => {
    const items = [{ id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' }];
    let checkpoint = createPlanCheckpoint(buildPlan(items));
    checkpoint = advanceCheckpoint(checkpoint, { passed: false });
    const progress = planProgress(checkpoint);
    assert.equal(progress.isComplete, true);
    assert.equal(progress.percentComplete, 1);
    assert.equal(progress.stepsRemaining, 0);
    assert.equal(progress.passRate, 0);
  });
});

describe('forecastConfidence', () => {
  it('returns zeroes for null or zero-step checkpoint', () => {
    assert.equal(forecastConfidence(null).projectedConfidence, 0);
    assert.equal(forecastConfidence({ totalSteps: 0 }).projectedConfidence, 0);
  });

  it('projects baseline confidence when every observed step has passed', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    let checkpoint = createPlanCheckpoint(buildPlan(items));
    checkpoint = advanceCheckpoint(checkpoint, { passed: true });
    const forecast = forecastConfidence(checkpoint);
    assert.equal(forecast.projectedPassRate, 1);
    assert.equal(forecast.projectedConfidence, checkpoint.baselineConfidence);
  });

  it('projects degraded confidence when observed pass rate is below 1', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    let checkpoint = createPlanCheckpoint(buildPlan(items));
    checkpoint = advanceCheckpoint(checkpoint, { passed: false });
    const forecast = forecastConfidence(checkpoint);
    assert.ok(forecast.projectedConfidence < checkpoint.baselineConfidence);
    assert.ok(forecast.projectedPassRate < 1);
  });
});

describe('shouldAbortRun', () => {
  it('reports insufficient_data for a fresh checkpoint with no observed steps', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    const checkpoint = createPlanCheckpoint(buildPlan(items));
    const decision = shouldAbortRun(checkpoint, 0.9);
    assert.equal(decision.abort, false);
    assert.equal(decision.reason, 'insufficient_data');
  });

  it('signals abort when projected confidence falls below the threshold', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Outcome' },
    ];
    let checkpoint = createPlanCheckpoint(buildPlan(items));
    checkpoint = advanceCheckpoint(checkpoint, { passed: false });
    const decision = shouldAbortRun(checkpoint, 0.5);
    assert.equal(decision.abort, true);
    assert.equal(decision.reason, 'below_threshold');
    assert.ok(decision.projectedConfidence < 0.5);
  });

  it('stays within threshold while observed steps continue to pass', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 5, date: '2026-05-01', category: 'Outcome' },
    ];
    let checkpoint = createPlanCheckpoint(buildPlan(items));
    checkpoint = advanceCheckpoint(checkpoint, { passed: true });
    const decision = shouldAbortRun(checkpoint, 0);
    assert.equal(decision.abort, false);
    assert.equal(decision.reason, 'within_threshold');
  });
});

describe('compareSummaries', () => {
  it('reports recovered ids when a retry resolves prior failures', () => {
    const before = { failedIds: ['a', 'b'], passRate: 0 };
    const after = { failedIds: [], passRate: 1 };
    const delta = compareSummaries(before, after);
    assert.deepEqual(delta.recovered.sort(), ['a', 'b']);
    assert.deepEqual(delta.regressed, []);
    assert.equal(delta.passRateDelta, 1);
    assert.equal(delta.improved, true);
  });

  it('reports regressed ids when previously-passing steps fail on a re-run', () => {
    const before = { failedIds: ['a'], passRate: 0.5 };
    const after = { failedIds: ['a', 'c'], passRate: 0 };
    const delta = compareSummaries(before, after);
    assert.deepEqual(delta.recovered, []);
    assert.deepEqual(delta.regressed, ['c']);
    assert.ok(delta.passRateDelta < 0);
    assert.equal(delta.improved, false);
  });

  it('treats null/missing summaries as empty failure sets', () => {
    const delta = compareSummaries(null, { failedIds: ['x'], passRate: 0 });
    assert.deepEqual(delta.recovered, []);
    assert.deepEqual(delta.regressed, ['x']);
  });
});

describe('findChronicFailures', () => {
  it('returns empty array for empty or non-array input', () => {
    assert.deepEqual(findChronicFailures([]), []);
    assert.deepEqual(findChronicFailures(null), []);
  });

  it('returns ids that fail in every provided summary', () => {
    const summaries = [
      { failedIds: ['a', 'b', 'c'] },
      { failedIds: ['b', 'c', 'd'] },
      { failedIds: ['c', 'b'] },
    ];
    assert.deepEqual(findChronicFailures(summaries), ['b', 'c']);
  });

  it('returns empty when a retry recovered every prior failure', () => {
    const summaries = [{ failedIds: ['a', 'b'] }, { failedIds: [] }];
    assert.deepEqual(findChronicFailures(summaries), []);
  });

  it('skips summaries with no failedIds field instead of throwing', () => {
    const summaries = [{ failedIds: ['a'] }, null, { failedIds: ['a'] }];
    assert.deepEqual(findChronicFailures(summaries), ['a']);
  });
});

describe('summarizePlanRun', () => {
  it('returns invalid_result for null input', () => {
    const summary = summarizePlanRun(null);
    assert.equal(summary.reason, 'invalid_result');
    assert.equal(summary.stepsRun, 0);
    assert.deepEqual(summary.failedIds, []);
  });

  it('collects failed action ids when steps fail', () => {
    const items = [
      { id: 'a', title: 'A', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Quote' },
      { id: 'b', title: 'B', state: 'Collected', metric: 2, date: '2025-01-01', category: 'Outcome' },
    ];
    const plan = buildPlan(items);
    const summary = summarizePlanRun(runPlanLoop(plan, items));
    assert.equal(summary.failCount, plan.actions.length);
    assert.equal(summary.passRate, 0);
    assert.ok(summary.failedIds.includes('a') && summary.failedIds.includes('b'));
  });
});

describe('scorePlanReadiness', () => {
  it('returns invalid_plan for null input', () => {
    const readiness = scorePlanReadiness(null);
    assert.equal(readiness.ready, false);
    assert.equal(readiness.score, 0);
    assert.deepEqual(readiness.issues, ['invalid_plan']);
  });

  it('passes a stable, high-confidence plan with no gaps or urgent actions', () => {
    const plan = {
      actions: [
        { id: 'a', urgency: 0.2 },
        { id: 'b', urgency: 0.4 },
      ],
      gaps: [],
      confidence: 0.82,
    };
    const readiness = scorePlanReadiness(plan);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.score, 100);
    assert.equal(readiness.checkedActions, 2);
    assert.deepEqual(readiness.issues, []);
  });

  it('flags deterministic readiness risks for agent eval gates', () => {
    const plan = {
      actions: [
        { id: 'dup', urgency: 0.9 },
        { id: 'dup', urgency: 0.2 },
        { urgency: 0.1 },
      ],
      gaps: ['Quote'],
      confidence: 0.3,
    };
    const readiness = scorePlanReadiness(plan, { minConfidence: 0.6, maxUrgency: 0.8 });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.score, 10);
    assert.deepEqual(readiness.issues, [
      'low_confidence',
      'category_gaps',
      'missing_action_id',
      'duplicate_action_id',
      'over_urgent_action',
    ]);
  });
});
