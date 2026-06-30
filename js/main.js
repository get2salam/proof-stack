const SPEC = {
  "slug": "proof-stack",
  "title": "Proof Stack",
  "description": "Organize screenshots, wins, quotes, and outcomes into a stronger proof library.",
  "lede": "Turn proof assets into a usable library with source notes, best use, trust lift, and review timing.",
  "heroEyebrow": "Proof library workspace",
  "boardTitle": "Proof stack board",
  "boardSubtitle": "A local-first board for making wins, quotes, screenshots, and outcomes easier to reuse.",
  "accent": "Proof compounds harder when source, best use, and trust lift are visible, not buried in folders.",
  "itemLabel": "proof asset",
  "itemPluralLabel": "Proof assets",
  "labels": {
    "title": "Proof asset",
    "note": "Proof note",
    "category": "Asset type",
    "state": "Status",
    "score": "Value",
    "effort": "Cleanup"
  },
  "metric": {
    "label": "Trust lift",
    "min": 1,
    "max": 10,
    "default": 6
  },
  "textOne": {
    "label": "Source",
    "default": "Where this proof came from"
  },
  "textTwo": {
    "label": "Best use",
    "default": "Where this proof should appear"
  },
  "date": {
    "label": "Review date"
  },
  "categories": [
    "Outcome",
    "Quote",
    "Screenshot",
    "Case study"
  ],
  "states": [
    "Collected",
    "Curated",
    "Ready",
    "Published"
  ],
  "completedStates": [
    "Published"
  ],
  "stateWeights": {
    "Collected": 3,
    "Curated": 8,
    "Ready": 10,
    "Published": 3
  },
  "defaults": {
    "note": "Write why this asset earns trust better than a generic claim ever could."
  },
  "stats": {
    "totalLabel": "Proof assets",
    "motionLabel": "Ready to use",
    "dueLabel": "Review soon"
  },
  "insights": {
    "topLabel": "Best trust asset",
    "dateLabel": "Next review slot",
    "metricLabel": "Highest trust lift"
  },
  "queue": {
    "eyebrow": "Proof queue",
    "title": "What should be curated next",
    "empty": "Published assets leave the active proof queue."
  },
  "mix": {
    "eyebrow": "Proof mix",
    "title": "How your trust assets are distributed"
  },
  "emptyTitle": "No proof assets yet",
  "emptyBody": "Add outcomes, quotes, screenshots, and case-study pieces worth reusing.",
  "actions": [
    {
      "id": "curate",
      "label": "Curate asset",
      "mode": "advance",
      "state": "Curated",
      "days": 2,
      "fromToday": true,
      "toast": "Curated this proof asset."
    },
    {
      "id": "raise-trust",
      "label": "Raise trust lift",
      "mode": "advance",
      "metricDelta": 1,
      "toast": "Raised the trust lift on this asset."
    },
    {
      "id": "ready",
      "label": "Mark ready",
      "mode": "advance",
      "state": "Ready",
      "days": 1,
      "fromToday": true,
      "toast": "Marked this proof asset ready."
    }
  ],
  "theme": {
    "primary": "#facc15",
    "secondary": "#fb7185",
    "panel": "#17140b",
    "edge": "#6b5a25",
    "glow": "rgba(250, 204, 21, 0.22)"
  },
  "items": [
    {
      "title": "Before and after workflow screenshot",
      "category": "Screenshot",
      "state": "Curated",
      "score": 8,
      "effort": 2,
      "metric": 8,
      "textOne": "Client dashboard",
      "textTwo": "Landing page proof strip",
      "date": "2026-04-25",
      "note": "Shows visible transformation faster than a paragraph ever could."
    },
    {
      "title": "Founder testimonial line",
      "category": "Quote",
      "state": "Collected",
      "score": 7,
      "effort": 3,
      "metric": 7,
      "textOne": "Call transcript",
      "textTwo": "Sales deck sidebar",
      "date": "2026-04-27",
      "note": "Strong line, but it still needs a cleaner format and attribution style."
    },
    {
      "title": "Operational case study result",
      "category": "Case study",
      "state": "Ready",
      "score": 9,
      "effort": 4,
      "metric": 9,
      "textOne": "Internal project notes",
      "textTwo": "Outbound proof packet",
      "date": "2026-04-26",
      "note": "High-trust asset once tightened into a clean before/after narrative."
    }
  ]
};
const STORAGE_KEY = `${SPEC.slug}/state/v3`;
const refs = {
  boardTitle: document.querySelector('[data-role="board-title"]'),
  boardSubtitle: document.querySelector('[data-role="board-subtitle"]'),
  stats: document.querySelector('[data-role="stats"]'),
  insights: document.querySelector('[data-role="insights"]'),
  count: document.querySelector('[data-role="count"]'),
  list: document.querySelector('[data-role="list"]'),
  editor: document.querySelector('[data-role="editor"]'),
  secondaryPrimary: document.querySelector('[data-role="secondary-primary"]'),
  secondarySecondary: document.querySelector('[data-role="secondary-secondary"]'),
  search: document.querySelector('[data-field="search"]'),
  category: document.querySelector('[data-field="category"]'),
  status: document.querySelector('[data-field="status"]'),
  importFile: document.querySelector('#import-file'),
};

const toastHost = (() => {
  const host = document.createElement('div');
  host.className = 'toast-host';
  // role="status" plus aria-live="polite" lets screen readers announce toast
  // text when nodes are appended, so users of assistive tech get the same
  // confirmation feedback ("Added a new proof asset", "Imported backup") that
  // sighted users see.
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
})();

function showToast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  // Announce each toast as a single unit instead of reading the appended diff.
  node.setAttribute('aria-atomic', 'true');
  node.textContent = message;
  toastHost.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 200);
  }, 2200);
}

function uid() {
  return `${SPEC.slug}_${Math.random().toString(36).slice(2, 10)}`;
}

function toLocalISODate(date) {
  // Avoid toISOString() here — it converts to UTC and shifts the calendar day
  // for users in non-zero UTC offsets, breaking review-date math near midnight.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayISO(offset = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return toLocalISODate(date);
}

function daysFromToday(value) {
  if (!value) return 999;
  const today = new Date(`${todayISO()}T00:00:00`);
  const target = new Date(`${value}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function bumpDate(value, days) {
  const date = new Date(`${value || todayISO()}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function safeNumber(value, fallback, min, max) {
  // Imported JSON or migrated state can carry non-numeric score/effort/metric
  // fields. Number("abc") is NaN, and clamp() then returns NaN because
  // Math.min/max propagate NaN — that poisons priority(), the sort comparator,
  // and the range inputs' value attributes downstream. Treat null/undefined
  // as missing rather than coercing them to 0 and clamping to the lower bound.
  if (value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function safeISODate(value, fallback) {
  // Imported JSON or migrated state can carry arbitrary strings; an unvalidated
  // date breaks daysFromToday/bumpDate and, when echoed into an input value
  // attribute, would let a crafted backup escape the quote and inject markup.
  // Round-trip through Date so impossible calendar days (e.g. Feb 29 in a
  // non-leap year) are rejected instead of silently rolling forward.
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return toLocalISODate(parsed) === value ? value : fallback;
}

function completedStates() {
  return new Set(SPEC.completedStates || []);
}

function stateWeight(state) {
  return (SPEC.stateWeights || {})[state] ?? 0;
}

function toneForDate(item) {
  if (completedStates().has(item.state)) return 'success';
  const days = daysFromToday(item.date);
  if (days <= 0) return 'danger';
  if (days <= 2) return 'warn';
  return 'success';
}

function normalize(item = {}) {
  return {
    id: item.id || uid(),
    title: item.title || `New ${SPEC.itemLabel}`,
    note: item.note || SPEC.defaults.note,
    category: SPEC.categories.includes(item.category) ? item.category : SPEC.categories[0],
    state: SPEC.states.includes(item.state) ? item.state : SPEC.states[0],
    score: safeNumber(item.score, 7, 1, 10),
    effort: safeNumber(item.effort, 3, 1, 10),
    metric: safeNumber(item.metric, SPEC.metric.default ?? 6, SPEC.metric.min, SPEC.metric.max),
    textOne: item.textOne || SPEC.textOne.default,
    textTwo: item.textTwo || SPEC.textTwo.default,
    date: safeISODate(item.date, todayISO(3)),
  };
}

function priority(item) {
  const completed = completedStates().has(item.state);
  const dueBoost = completed ? 0 : Math.max(0, 4 - Math.max(daysFromToday(item.date), 0)) * 4;
  return item.score * 6 + item.metric * 5 + dueBoost + stateWeight(item.state) - item.effort * 4;
}

function seedState() {
  return {
    boardTitle: SPEC.boardTitle,
    boardSubtitle: SPEC.boardSubtitle,
    items: SPEC.items.map((item) => normalize(item)),
    ui: { search: '', category: 'all', status: 'all', selectedId: null },
  };
}

function safeString(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

function mergeImportedState(parsed) {
  // Persisted/imported state can carry arbitrary types. Without these guards a
  // non-string boardTitle would render as "[object Object]" in the heading and
  // a non-string ui.search would crash filteredItems()'s trim() call.
  const base = seedState();
  const parsedUi = isPlainObject(parsed.ui) ? parsed.ui : {};
  return {
    ...base,
    boardTitle: safeString(parsed.boardTitle, base.boardTitle),
    boardSubtitle: safeString(parsed.boardSubtitle, base.boardSubtitle),
    items: (Array.isArray(parsed.items) ? parsed.items : []).filter(isPlainObject).map((item) => normalize(item)),
    ui: {
      search: safeString(parsedUi.search, base.ui.search),
      category: safeString(parsedUi.category, base.ui.category),
      status: safeString(parsedUi.status, base.ui.status),
      selectedId: safeString(parsedUi.selectedId, base.ui.selectedId),
    },
  };
}

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return seedState();
    return mergeImportedState(parsed);
  } catch (error) {
    console.warn('Falling back to seed state', error);
    return seedState();
  }
}

let state = hydrate();
if (!state.ui.selectedId && state.items[0]) state.ui.selectedId = state.items[0].id;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function filteredItems() {
  const query = state.ui.search.trim().toLowerCase();
  return [...state.items]
    .filter((item) => state.ui.category === 'all' || item.category === state.ui.category)
    .filter((item) => state.ui.status === 'all' || item.state === state.ui.status)
    .filter((item) => !query || `${item.title} ${item.note} ${item.category} ${item.state} ${item.textOne} ${item.textTwo}`.toLowerCase().includes(query))
    .sort((a, b) => priority(b) - priority(a) || daysFromToday(a.date) - daysFromToday(b.date));
}

function selectedItem() {
  return state.items.find((item) => item.id === state.ui.selectedId) || filteredItems()[0] || null;
}

function commit(nextState) {
  state = nextState;
  if (!state.ui.selectedId && state.items[0]) state.ui.selectedId = state.items[0].id;
  persist();
  render();
}

function updateSelected(field, value) {
  const target = selectedItem();
  if (!target) return;
  commit({
    ...state,
    items: state.items.map((item) => {
      if (item.id !== target.id) return item;
      const next = { ...item, [field]: value };
      if (['score', 'effort', 'metric'].includes(field)) {
        const bounds = field === 'metric' ? SPEC.metric : { min: 1, max: 10 };
        next[field] = clamp(value, bounds.min, bounds.max);
      }
      return next;
    }),
  });
}

function addItem() {
  const item = normalize({ title: `New ${SPEC.itemLabel}`, note: SPEC.defaults.note, textOne: SPEC.textOne.default, textTwo: SPEC.textTwo.default });
  commit({
    ...state,
    items: [item, ...state.items],
    ui: { ...state.ui, selectedId: item.id },
  });
  showToast(`Added a new ${SPEC.itemLabel}.`);
  requestAnimationFrame(() => {
    const titleField = refs.editor.querySelector('[data-item-field="title"]');
    if (titleField) titleField.focus();
  });
}

function removeSelected() {
  const target = selectedItem();
  if (!target) return;
  // Remove is destructive and there is no undo, so require an explicit confirm
  // before discarding the selected asset.
  if (!window.confirm(`Remove "${target.title}"?`)) return;
  const nextItems = state.items.filter((item) => item.id !== target.id);
  commit({
    ...state,
    items: nextItems,
    ui: { ...state.ui, selectedId: nextItems[0]?.id || null },
  });
  showToast(`Removed ${SPEC.itemLabel}.`);
  requestAnimationFrame(() => {
    const firstItem = refs.list.querySelector('.item');
    if (firstItem) firstItem.focus();
  });
}

function exportState() {
  const blob = new Blob([JSON.stringify({ schema: `${SPEC.slug}/v3`, ...state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${SPEC.slug}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded backup.');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseImportedBackup(raw) {
  // Backups can carry arbitrary JSON. Without these guards a top-level array,
  // primitive, or null reaches the spread/`.items` accesses below and either
  // throws an unhelpful TypeError or produces a state object with stray keys
  // from a spread string. Filtering item entries protects normalize(), whose
  // `= {}` default only applies to `undefined` and would crash on `null`.
  const parsed = JSON.parse(raw);
  if (!isPlainObject(parsed)) throw new Error('Backup must be a JSON object');
  const items = Array.isArray(parsed.items) ? parsed.items.filter(isPlainObject) : [];
  const ui = isPlainObject(parsed.ui) ? parsed.ui : {};
  return { ...parsed, items, ui };
}

async function importState(file) {
  const raw = await file.text();
  const parsed = parseImportedBackup(raw);
  commit(mergeImportedState(parsed));
  showToast('Imported backup.');
}

async function copyValue(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`Copied ${label}.`);
  } catch {
    window.prompt(`Copy ${label}:`, value);
  }
}

function runAction(action) {
  const target = selectedItem();
  if (!target) return;
  if (action.mode === 'copy') {
    copyValue(target[action.key] || '', action.label.toLowerCase());
    return;
  }

  const metricMin = SPEC.metric.min;
  const metricMax = SPEC.metric.max;

  commit({
    ...state,
    items: state.items.map((item) => {
      if (item.id !== target.id) return item;
      const next = { ...item };
      if (action.state) next.state = action.state;
      if (action.days !== undefined) next.date = bumpDate(action.fromToday ? todayISO() : item.date, action.days);
      if (action.metricDelta) next.metric = clamp(item.metric + action.metricDelta, metricMin, metricMax);
      if (action.scoreDelta) next.score = clamp(item.score + action.scoreDelta, 1, 10);
      if (action.effortDelta) next.effort = clamp(item.effort + action.effortDelta, 1, 10);
      return next;
    }),
  });
  showToast(action.toast || action.label);
}

function renderStats(items) {
  const completed = state.items.filter((item) => completedStates().has(item.state)).length;
  const inMotion = state.items.filter((item) => !completedStates().has(item.state) && item.state !== SPEC.states[0]).length;
  const dueSoon = state.items.filter((item) => !completedStates().has(item.state) && daysFromToday(item.date) <= 3).length;
  const avgMetric = state.items.length ? (state.items.reduce((sum, item) => sum + item.metric, 0) / state.items.length).toFixed(1) : '0.0';
  const cards = [
    [SPEC.stats.totalLabel || SPEC.itemPluralLabel, String(state.items.length), `tracked ${SPEC.itemPluralLabel.toLowerCase()} on the board`],
    [SPEC.stats.motionLabel || 'In motion', String(inMotion), `${completed} completed or parked`],
    [SPEC.stats.dueLabel || 'Due soon', String(dueSoon), `${items.length} visible under current filters`],
    [SPEC.metric.label, avgMetric, `average ${SPEC.metric.label.toLowerCase()} across the board`],
  ];
  refs.stats.innerHTML = cards.map(([label, valueText, note]) => `
    <article class="card stat">
      <span>${label}</span>
      <strong>${valueText}</strong>
      <small>${note}</small>
    </article>
  `).join('');
  refs.count.textContent = items[0] ? `Top: ${items[0].title}` : `No ${SPEC.itemPluralLabel.toLowerCase()}`;
}

function renderInsights(items) {
  const nextSlot = [...state.items].filter((item) => !completedStates().has(item.state)).sort((a, b) => daysFromToday(a.date) - daysFromToday(b.date))[0];
  const strongestMetric = [...state.items].sort((a, b) => b.metric - a.metric)[0];
  const bestBet = items[0];
  const cards = [
    {
      label: SPEC.insights.topLabel || 'Best current bet',
      title: bestBet?.title || `No ${SPEC.itemLabel} yet`,
      body: bestBet ? `Priority ${priority(bestBet)} with ${SPEC.metric.label.toLowerCase()} ${bestBet.metric}/${SPEC.metric.max}.` : 'Add a record and the best current bet will surface here.',
    },
    {
      label: SPEC.insights.dateLabel || SPEC.date.label,
      title: nextSlot?.title || 'Nothing queued',
      body: nextSlot ? `${formatDate(nextSlot.date)} with ${SPEC.textTwo.label.toLowerCase()}: ${nextSlot.textTwo}.` : 'Your next review slot will surface here.',
    },
    {
      label: SPEC.insights.metricLabel || `Highest ${SPEC.metric.label.toLowerCase()}`,
      title: strongestMetric?.title || `No ${SPEC.itemLabel} yet`,
      body: strongestMetric ? `${SPEC.metric.label} ${strongestMetric.metric}/${SPEC.metric.max} and state ${strongestMetric.state}.` : 'Metric standouts appear here once the board has data.',
    },
  ];
  refs.insights.innerHTML = cards.map((card) => `
    <article class="card insight-card">
      <p class="eyebrow">${escapeHtml(card.label)}</p>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.body)}</p>
    </article>
  `).join('');
}

function renderList(items) {
  if (!items.length) {
    refs.list.innerHTML = `
      <div class="empty">
        <strong>${SPEC.emptyTitle}</strong>
        <p>${SPEC.emptyBody}</p>
      </div>
    `;
    return;
  }

  refs.list.innerHTML = items.map((item) => `
    <button class="item ${item.id === state.ui.selectedId ? 'is-selected' : ''}" type="button" data-id="${escapeHtml(item.id)}">
      <div class="item-top">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="score">${priority(item)}</span>
      </div>
      <p>${escapeHtml(item.note)}</p>
      <div class="badge-row">
        <span class="pill ${toneForDate(item)}">${formatDate(item.date)}</span>
        <span class="pill">${escapeHtml(item.textOne)}</span>
        <span class="pill">${escapeHtml(SPEC.metric.label)} ${item.metric}/${SPEC.metric.max}</span>
      </div>
      <div class="meta">
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.state)}</span>
        <span>${escapeHtml(SPEC.textTwo.label)}: ${escapeHtml(item.textTwo)}</span>
        <span>Friction ${item.effort}/10</span>
      </div>
    </button>
  `).join('');
}

function renderEditor(item) {
  if (!item) {
    refs.editor.innerHTML = `
      <div class="empty">
        <strong>No selection</strong>
        <p>Pick a ${SPEC.itemLabel} or create a new one.</p>
      </div>
    `;
    return;
  }

  refs.editor.innerHTML = `
    <div class="editor-head">
      <div>
        <p class="eyebrow">${escapeHtml(SPEC.editorEyebrow || `${SPEC.itemLabel} editor`)}</p>
        <h3>${escapeHtml(item.title)}</h3>
      </div>
      <span class="score">Priority ${priority(item)}</span>
    </div>
    <div class="editor-grid">
      <label class="field">
        <span>${SPEC.labels.title}</span>
        <input type="text" data-item-field="title" value="${escapeHtml(item.title)}" />
      </label>
      <label class="field">
        <span>${SPEC.textOne.label}</span>
        <input type="text" data-item-field="textOne" value="${escapeHtml(item.textOne)}" />
      </label>
      <label class="field">
        <span>${SPEC.textTwo.label}</span>
        <input type="text" data-item-field="textTwo" value="${escapeHtml(item.textTwo)}" />
      </label>
      <label class="field">
        <span>${SPEC.labels.note}</span>
        <textarea data-item-field="note">${escapeHtml(item.note)}</textarea>
      </label>
      <div class="field-grid">
        <label class="field">
          <span>${SPEC.labels.category}</span>
          <select data-item-field="category">${SPEC.categories.map((entry) => `<option value="${entry}" ${item.category === entry ? 'selected' : ''}>${entry}</option>`).join('')}</select>
        </label>
        <label class="field">
          <span>${SPEC.labels.state}</span>
          <select data-item-field="state">${SPEC.states.map((entry) => `<option value="${entry}" ${item.state === entry ? 'selected' : ''}>${entry}</option>`).join('')}</select>
        </label>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>${SPEC.date.label}</span>
          <input type="date" data-item-field="date" value="${escapeHtml(item.date)}" />
        </label>
        <label class="field range-wrap">
          <span>${SPEC.metric.label}</span>
          <input type="range" min="${SPEC.metric.min}" max="${SPEC.metric.max}" data-item-field="metric" value="${item.metric}" />
          <output>${item.metric} / ${SPEC.metric.max}</output>
        </label>
      </div>
      <div class="field-grid three">
        <label class="field range-wrap">
          <span>${SPEC.labels.score}</span>
          <input type="range" min="1" max="10" data-item-field="score" value="${item.score}" />
          <output>${item.score} / 10</output>
        </label>
        <label class="field range-wrap">
          <span>${SPEC.labels.effort}</span>
          <input type="range" min="1" max="10" data-item-field="effort" value="${item.effort}" />
          <output>${item.effort} / 10</output>
        </label>
        <label class="field range-wrap">
          <span>Priority</span>
          <input type="range" min="0" max="100" value="${Math.min(100, priority(item))}" disabled />
          <output>${priority(item)}</output>
        </label>
      </div>
      <div class="quick-actions">
        ${SPEC.actions.map((action) => `<button class="btn" type="button" data-action-id="${action.id}">${action.label}</button>`).join('')}
      </div>
      <div class="editor-actions">
        <span class="helper">${SPEC.date.label} ${formatDate(item.date)} and ${SPEC.metric.label.toLowerCase()} ${item.metric}/${SPEC.metric.max}.</span>
        <button class="btn btn-danger" type="button" data-action="remove-current">Remove</button>
      </div>
    </div>
  `;
}

function renderPanels() {
  const queue = [...state.items].filter((item) => !completedStates().has(item.state)).sort((a, b) => daysFromToday(a.date) - daysFromToday(b.date));
  refs.secondaryPrimary.innerHTML = `
    <div class="secondary-head">
      <div>
        <p class="eyebrow">${SPEC.queue.eyebrow}</p>
        <h3>${SPEC.queue.title}</h3>
      </div>
      <span class="chip">${queue.length} pending</span>
    </div>
    <div class="stack">
      ${queue.slice(0, 4).map((item) => `
        <div class="mini-card">
          <div class="inline-split">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="pill ${toneForDate(item)}">${formatDate(item.date)}</span>
          </div>
          <p>${escapeHtml(item.textOne)} · ${escapeHtml(item.textTwo)} · ${escapeHtml(SPEC.metric.label.toLowerCase())} ${item.metric}/${SPEC.metric.max}.</p>
        </div>
      `).join('') || `<div class="empty"><strong>No pending ${SPEC.itemPluralLabel.toLowerCase()}</strong><p>${SPEC.queue.empty}</p></div>`}
    </div>
  `;

  const byCategory = SPEC.categories.map((entry) => ({ entry, count: state.items.filter((item) => item.category === entry).length }));
  const strongest = state.items.length ? [...state.items].sort((a, b) => b.metric - a.metric)[0].title : '—';
  refs.secondarySecondary.innerHTML = `
    <div class="secondary-head">
      <div>
        <p class="eyebrow">${escapeHtml(SPEC.mix.eyebrow)}</p>
        <h3>${escapeHtml(SPEC.mix.title)}</h3>
      </div>
      <span class="chip">${state.items.length} total</span>
    </div>
    <ul class="metric-list">
      ${byCategory.map(({ entry, count }) => `<li><span>${escapeHtml(entry)}</span><strong>${count}</strong></li>`).join('')}
      <li><span>Strongest ${escapeHtml(SPEC.metric.label.toLowerCase())}</span><strong>${escapeHtml(strongest)}</strong></li>
    </ul>
  `;
}

function render() {
  refs.boardTitle.textContent = state.boardTitle;
  refs.boardSubtitle.textContent = state.boardSubtitle;
  refs.search.value = state.ui.search;
  refs.category.innerHTML = `<option value="all">All ${SPEC.labels.category.toLowerCase()}</option>${SPEC.categories.map((entry) => `<option value="${entry}" ${state.ui.category === entry ? 'selected' : ''}>${entry}</option>`).join('')}`;
  refs.status.innerHTML = `<option value="all">All ${SPEC.labels.state.toLowerCase()}</option>${SPEC.states.map((entry) => `<option value="${entry}" ${state.ui.status === entry ? 'selected' : ''}>${entry}</option>`).join('')}`;
  const items = filteredItems();
  if (!items.some((item) => item.id === state.ui.selectedId)) state.ui.selectedId = items[0]?.id || null;
  renderStats(items);
  renderInsights(items);
  renderList(items);
  renderEditor(selectedItem());
  renderPanels();
}

document.addEventListener('click', (event) => {
  const itemButton = event.target.closest('.item');
  if (itemButton) {
    commit({ ...state, ui: { ...state.ui, selectedId: itemButton.dataset.id } });
    return;
  }

  const explicit = event.target.closest('[data-action]')?.dataset.action;
  if (explicit === 'new') { addItem(); return; }
  if (explicit === 'reset') { commit(seedState()); showToast('Re-seeded sample board.'); return; }
  if (explicit === 'remove-current') { removeSelected(); return; }
  if (explicit === 'export') { exportState(); return; }
  if (explicit === 'import') { refs.importFile.click(); return; }

  const actionId = event.target.closest('[data-action-id]')?.dataset.actionId;
  if (actionId) {
    const action = SPEC.actions.find((entry) => entry.id === actionId);
    if (action) runAction(action);
  }
});

document.addEventListener('input', (event) => {
  const field = event.target.dataset.field;
  if (field === 'search') {
    commit({ ...state, ui: { ...state.ui, search: event.target.value } });
    return;
  }
  const itemField = event.target.dataset.itemField;
  if (itemField) updateSelected(itemField, event.target.value);
});

document.addEventListener('change', async (event) => {
  const field = event.target.dataset.field;
  if (field === 'category' || field === 'status') {
    commit({ ...state, ui: { ...state.ui, [field]: event.target.value } });
    return;
  }
  if (event.target.id === 'import-file') {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importState(file);
    } catch (error) {
      console.error(error);
      showToast('Import failed.');
    } finally {
      event.target.value = '';
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && event.target === refs.search) {
    event.preventDefault();
    commit({ ...state, ui: { ...state.ui, search: '' } });
    refs.search.blur();
    return;
  }
  if (event.target.closest('input, textarea, select')) return;
  // Skip when a modifier is held so we never swallow browser/system shortcuts
  // like Cmd+N (new window), Ctrl+N, or Cmd+/ — preventDefault() would
  // otherwise silently block them while still triggering our handler.
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.isComposing) return;
  // Browsers fire keydown repeatedly while a key is held; without this guard,
  // holding N would spawn a new asset every few milliseconds and holding /
  // would keep re-focusing the search box.
  if (event.repeat) return;
  if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    addItem();
    return;
  }
  if (event.key === '/') {
    event.preventDefault();
    refs.search.focus();
  }
});

render();
