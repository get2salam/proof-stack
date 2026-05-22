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
