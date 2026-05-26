/**
 * Lightweight agent-planning helpers for Proof Stack.
 *
 * buildPlan(items)            → ranked action plan for autonomous agent consumption
 * evaluateStep(item, state)   → pass/fail rubric check for a completed plan step
 */

const ADVANCE_ORDER = ['Collected', 'Curated', 'Ready', 'Published'];
const STALE_THRESHOLD_DAYS = 60;
const GAP_MIN_COUNT = 2;

function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  return (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
}

// Score urgency for agent prioritization: higher = needs attention sooner.
function itemUrgency(item) {
  const stateIdx = ADVANCE_ORDER.indexOf(item.state ?? 'Collected');
  const stateProgress = (stateIdx + 1) / ADVANCE_ORDER.length;
  const staleness = Math.min(daysSince(item.date) / STALE_THRESHOLD_DAYS, 1);
  const trustGap = Math.max(0, 1 - (item.metric ?? 5) / 10);
  return +(staleness * 0.4 + trustGap * 0.35 + (1 - stateProgress) * 0.25).toFixed(3);
}

// Flag categories with fewer than GAP_MIN_COUNT assets — collection blind spots.
function detectGaps(items) {
  const counts = {};
  for (const item of items) {
    const key = item.category || 'Unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, n]) => n < GAP_MIN_COUNT)
    .map(([category]) => category);
}

/**
 * Produce a ranked action plan from the current proof-asset array.
 * Suitable for feeding directly to an agent loop or displaying as AI recommendations.
 */
export function buildPlan(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { actions: [], gaps: [], confidence: 0, summary: 'No proof assets found.' };
  }

  const scored = items
    .map(item => ({ ...item, urgency: itemUrgency(item) }))
    .sort((a, b) => b.urgency - a.urgency);

  const actions = scored.slice(0, 5).map((item, i) => {
    const stateIdx = ADVANCE_ORDER.indexOf(item.state ?? 'Collected');
    const targetState = ADVANCE_ORDER[Math.min(stateIdx + 1, ADVANCE_ORDER.length - 1)];
    return { rank: i + 1, id: item.id, title: item.title, currentState: item.state, targetState, urgency: item.urgency };
  });

  const gaps = detectGaps(items);
  const avgUrgency = scored.reduce((s, i) => s + i.urgency, 0) / scored.length;
  const confidence = +(1 - avgUrgency).toFixed(2);

  return {
    actions,
    gaps,
    confidence,
    summary: `${actions.length} prioritized action(s); ${gaps.length} category gap(s); library confidence ${confidence}.`,
  };
}

/**
 * Evaluate whether a completed agent step advanced an item to the expected state.
 * Returns a structured pass/fail result for agent audit trails and rubric scoring.
 */
export function evaluateStep(item, expectedState) {
  const passed = item?.state === expectedState;
  return {
    id: item?.id ?? null,
    expected: expectedState,
    actual: item?.state ?? null,
    passed,
    reason: passed
      ? `State correctly advanced to '${expectedState}'.`
      : `Expected '${expectedState}', found '${item?.state ?? 'undefined'}'.`,
  };
}

/**
 * Create a checkpoint from a built plan to track agent execution progress.
 * Returns immutable snapshot of plan state with step index and pass/fail tracking.
 */
export function createPlanCheckpoint(plan) {
  if (!plan || !Array.isArray(plan.actions)) {
    return { stepIndex: 0, totalSteps: 0, actions: [], baselineConfidence: 0, passCount: 0, passed: [] };
  }
  return {
    stepIndex: 0,
    totalSteps: plan.actions.length,
    actions: plan.actions,
    baselineConfidence: plan.confidence,
    passCount: 0,
    passed: [],
  };
}

/**
 * Run a plan to completion by iterating through each action, evaluating it against
 * the provided items, and advancing the checkpoint with each result.
 *
 * Includes a maxSteps safety cap to prevent runaway autonomous execution.
 * Returns the final checkpoint, a per-step execution log, and a termination reason.
 */
export function runPlanLoop(plan, items, { maxSteps = 50, haltOnFailure = false } = {}) {
  if (!plan || !Array.isArray(plan.actions)) {
    return { checkpoint: null, log: [], halted: true, reason: 'invalid_plan' };
  }

  const itemMap = new Map(
    (Array.isArray(items) ? items : []).map(item => [item.id, item])
  );

  let checkpoint = createPlanCheckpoint(plan);
  const log = [];

  while (checkpoint.stepIndex < checkpoint.totalSteps) {
    if (log.length >= maxSteps) {
      return { checkpoint, log, halted: true, reason: 'max_steps_exceeded' };
    }

    const action = checkpoint.actions[checkpoint.stepIndex];
    const item = itemMap.get(action.id) ?? null;
    const evaluation = evaluateStep(item, action.targetState);

    log.push({ step: checkpoint.stepIndex, action, evaluation });
    checkpoint = advanceCheckpoint(checkpoint, evaluation);

    if (haltOnFailure && !evaluation.passed) {
      return { checkpoint, log, halted: true, reason: 'step_failed' };
    }
  }

  return { checkpoint, log, halted: false, reason: 'completed' };
}

/**
 * Filter a plan's actions to only those at or above a minimum urgency.
 * Returns a new plan object; the input plan is not mutated. Lets agents
 * focus exclusively on high-priority work and skip lower-urgency items
 * that buildPlan would otherwise queue for completeness.
 */
export function filterPlanActions(plan, minUrgency = 0) {
  if (!plan || !Array.isArray(plan.actions)) {
    return { actions: [], gaps: [], confidence: 0, summary: 'Invalid plan.' };
  }
  const threshold = Number.isFinite(minUrgency) ? minUrgency : 0;
  const actions = plan.actions.filter(action => (action.urgency ?? 0) >= threshold);
  return { ...plan, actions };
}

/**
 * Summarize a completed plan run for human/LLM audit consumption.
 * Aggregates pass/fail counts, the termination reason, and the ids of
 * failed steps so callers can render a single-glance audit line without
 * walking the per-step log themselves.
 */
export function summarizePlanRun(result) {
  if (!result || !Array.isArray(result.log)) {
    return { stepsRun: 0, passCount: 0, failCount: 0, passRate: 0, failedIds: [], reason: 'invalid_result' };
  }
  const passCount = result.log.filter(entry => entry.evaluation?.passed).length;
  const failedIds = result.log
    .filter(entry => !entry.evaluation?.passed)
    .map(entry => entry.action?.id ?? null);
  const stepsRun = result.log.length;
  const passRate = stepsRun > 0 ? +(passCount / stepsRun).toFixed(2) : 0;
  return { stepsRun, passCount, failCount: stepsRun - passCount, passRate, failedIds, reason: result.reason ?? 'unknown' };
}

/**
 * Diff two plans (typically a prior plan and a freshly rebuilt one) to surface
 * which action ids were added, removed, or reordered. Lets a re-planning agent
 * decide whether to keep executing the current queue or restart from the top
 * without walking both action arrays itself.
 */
export function diffPlans(prevPlan, nextPlan) {
  const prevIds = Array.isArray(prevPlan?.actions) ? prevPlan.actions.map(a => a.id) : [];
  const nextIds = Array.isArray(nextPlan?.actions) ? nextPlan.actions.map(a => a.id) : [];
  const prevSet = new Set(prevIds);
  const nextSet = new Set(nextIds);
  const added = nextIds.filter(id => !prevSet.has(id));
  const removed = prevIds.filter(id => !nextSet.has(id));
  const shared = nextIds.filter(id => prevSet.has(id));
  const reordered = shared.filter(id => prevIds.indexOf(id) !== nextIds.indexOf(id));
  return { added, removed, reordered, stable: added.length === 0 && removed.length === 0 && reordered.length === 0 };
}

/**
 * Advance a checkpoint by one step, recording pass/fail and updating confidence.
 * Returns updated checkpoint with step tracking for agent audit trails.
 */
export function advanceCheckpoint(checkpoint, stepEvaluation) {
  if (!checkpoint || !stepEvaluation) return checkpoint;
  const newPassCount = checkpoint.passCount + (stepEvaluation.passed ? 1 : 0);
  const newPassed = [...checkpoint.passed, stepEvaluation.passed];
  const stepIndex = Math.min(checkpoint.stepIndex + 1, checkpoint.totalSteps);
  const updatedConfidence = checkpoint.totalSteps > 0
    ? +(checkpoint.baselineConfidence * (newPassCount / checkpoint.totalSteps)).toFixed(2)
    : checkpoint.baselineConfidence;
  return {
    ...checkpoint,
    stepIndex,
    passCount: newPassCount,
    passed: newPassed,
    updatedConfidence,
  };
}
