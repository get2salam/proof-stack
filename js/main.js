        const CONFIG = {
  "slug": "proof-stack",
  "title": "Proof Stack",
  "tagline": "Organize screenshots, wins, quotes, and outcomes into a stronger proof library.",
  "domainLabel": "proofs",
  "itemLabel": "proof",
  "emptyTitle": "No proof items yet",
  "emptyBody": "Collect the screenshots, outcomes, and wins worth reusing.",
  "seedTitle": "Proof library",
  "seedSubtitle": "A small evidence system for trust-building assets.",
  "categories": [
    "Screenshot",
    "Outcome",
    "Quote",
    "Demo"
  ],
  "states": [
    "Loose",
    "Useful",
    "Strong",
    "Published"
  ],
  "items": [
    {
      "title": "Before and after dashboard visual",
      "category": "Screenshot",
      "state": "Strong",
      "score": 9,
      "effort": 2,
      "note": "Clear side-by-side proof is easier to trust than copy claims."
    },
    {
      "title": "Time saved case note",
      "category": "Outcome",
      "state": "Useful",
      "score": 8,
      "effort": 2,
      "note": "Quantify the saved hours instead of describing vague efficiency."
    },
    {
      "title": "Short demo clip",
      "category": "Demo",
      "state": "Loose",
      "score": 7,
      "effort": 4,
      "note": "A tiny clip can do more work than a full product tour."
    }
  ]
};
        const STORAGE_KEY = `${CONFIG.slug}/state/v1`;

        const refs = {
          boardTitle: document.querySelector('[data-role="board-title"]'),
          boardSubtitle: document.querySelector('[data-role="board-subtitle"]'),
          stats: document.querySelector('[data-role="stats"]'),
          count: document.querySelector('[data-role="count"]'),
          list: document.querySelector('[data-role="list"]'),
          editor: document.querySelector('[data-role="editor"]'),
          search: document.querySelector('[data-field="search"]'),
          category: document.querySelector('[data-field="category"]'),
          status: document.querySelector('[data-field="status"]'),
          importFile: document.querySelector('#import-file'),
        };

        const toastHost = (() => {
          const host = document.createElement('div');
          host.className = 'toast-host';
          document.body.appendChild(host);
          return host;
        })();

        function showToast(message) {
          const node = document.createElement('div');
          node.className = 'toast';
          node.textContent = message;
          toastHost.appendChild(node);
          requestAnimationFrame(() => node.classList.add('is-visible'));
          setTimeout(() => {
            node.classList.remove('is-visible');
            setTimeout(() => node.remove(), 200);
          }, 2200);
        }

        function uid() {
          return `${CONFIG.slug}_${Math.random().toString(36).slice(2, 10)}`;
        }

        function priority(item) {
          return item.score * 10 - item.effort * 4 + (CONFIG.states.length - CONFIG.states.indexOf(item.state));
        }

        function seedState() {
          return {
            boardTitle: CONFIG.seedTitle,
            boardSubtitle: CONFIG.seedSubtitle,
            items: CONFIG.items.map((item) => ({ ...item, id: uid() })),
            ui: { search: '', category: 'all', status: 'all', selectedId: null },
          };
        }

        function hydrate() {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return seedState();
            return { ...seedState(), ...JSON.parse(raw) };
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
            .filter((item) => !query || `${item.title} ${item.note} ${item.category} ${item.state}`.toLowerCase().includes(query))
            .sort((a, b) => priority(b) - priority(a) || a.title.localeCompare(b.title));
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

        function renderStats(items) {
          const active = items.filter((item) => item.state !== CONFIG.states.at(-1)).length;
          const strong = items.reduce((best, item) => priority(item) > priority(best) ? item : best, items[0] || null);
          const avgScore = items.length ? (items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(1) : '0.0';
          const cards = [
            ['Total', String(state.items.length), `${CONFIG.domainLabel} in this board`],
            ['Visible', String(items.length), 'matching the current filters'],
            ['Active', String(active), 'not parked or retired'],
            ['Signal', avgScore, 'average score across all items'],
          ];
          refs.stats.innerHTML = cards.map(([label, value, note]) => `
            <article class="card stat">
              <span>${label}</span>
              <strong>${value}</strong>
              <small>${note}</small>
            </article>
          `).join('');
          refs.count.textContent = strong ? `Top: ${strong.title}` : `0 ${CONFIG.domainLabel}`;
        }

        function renderList(items) {
          if (!items.length) {
            refs.list.innerHTML = `
              <div class="empty">
                <strong>${CONFIG.emptyTitle}</strong>
                <p>${CONFIG.emptyBody}</p>
              </div>
            `;
            return;
          }
          refs.list.innerHTML = items.map((item) => `
            <button class="item ${item.id === state.ui.selectedId ? 'is-selected' : ''}" type="button" data-id="${item.id}">
              <div class="item-top">
                <strong>${item.title}</strong>
                <span class="score">${priority(item)}</span>
              </div>
              <p>${item.note || 'No notes yet.'}</p>
              <div class="meta">
                <span>${item.category}</span>
                <span>${item.state}</span>
                <span>Score ${item.score}</span>
                <span>Effort ${item.effort}</span>
              </div>
            </button>
          `).join('');
        }

        function renderEditor(item) {
          if (!item) {
            refs.editor.innerHTML = `
              <div class="empty">
                <strong>No selection</strong>
                <p>Pick a ${CONFIG.itemLabel} or create a new one.</p>
              </div>
            `;
            return;
          }

          refs.editor.innerHTML = `
            <div class="editor-head">
              <div>
                <p class="eyebrow">${CONFIG.itemLabel}</p>
                <h3>Edit ${item.title}</h3>
              </div>
              <span class="score">Priority ${priority(item)}</span>
            </div>
            <div class="editor-grid">
              <label class="field">
                <span>Title</span>
                <input type="text" data-item-field="title" value="${escapeHtml(item.title)}" />
              </label>
              <label class="field">
                <span>Note</span>
                <textarea data-item-field="note">${escapeHtml(item.note || '')}</textarea>
              </label>
              <div class="field-grid">
                <label class="field">
                  <span>Type</span>
                  <select data-item-field="category">
                    ${CONFIG.categories.map((category) => `<option value="${category}" ${item.category === category ? 'selected' : ''}>${category}</option>`).join('')}
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select data-item-field="state">
                    ${CONFIG.states.map((entry) => `<option value="${entry}" ${item.state === entry ? 'selected' : ''}>${entry}</option>`).join('')}
                  </select>
                </label>
              </div>
              <div class="field-grid">
                <label class="field range-wrap">
                  <span>Score</span>
                  <input type="range" min="1" max="10" value="${item.score}" data-item-field="score" />
                  <output>${item.score} / 10</output>
                </label>
                <label class="field range-wrap">
                  <span>Effort</span>
                  <input type="range" min="1" max="10" value="${item.effort}" data-item-field="effort" />
                  <output>${item.effort} / 10</output>
                </label>
              </div>
              <div class="editor-actions">
                <button class="btn btn-danger" type="button" data-action="remove-current">Remove</button>
              </div>
            </div>
          `;
        }

        function escapeHtml(value) {
          return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
        }

        function render() {
          refs.boardTitle.textContent = state.boardTitle;
          refs.boardSubtitle.textContent = state.boardSubtitle;
          refs.search.value = state.ui.search;
          refs.category.innerHTML = `<option value="all">All types</option>${CONFIG.categories.map((category) => `<option value="${category}" ${state.ui.category === category ? 'selected' : ''}>${category}</option>`).join('')}`;
          refs.status.innerHTML = `<option value="all">All statuses</option>${CONFIG.states.map((entry) => `<option value="${entry}" ${state.ui.status === entry ? 'selected' : ''}>${entry}</option>`).join('')}`;
          const items = filteredItems();
          if (!items.some((item) => item.id === state.ui.selectedId)) state.ui.selectedId = items[0]?.id || null;
          renderStats(items);
          renderList(items);
          renderEditor(selectedItem());
        }

        function addItem() {
          const item = {
            id: uid(),
            title: `New ${CONFIG.itemLabel}`,
            note: 'Capture why this matters and what would make it stronger.',
            category: CONFIG.categories[0],
            state: CONFIG.states[0],
            score: 7,
            effort: 3,
          };
          commit({
            ...state,
            items: [item, ...state.items],
            ui: { ...state.ui, selectedId: item.id },
          });
          showToast(`Added a new ${CONFIG.itemLabel}.`);
        }

        function updateSelected(field, value) {
          const target = selectedItem();
          if (!target) return;
          commit({
            ...state,
            items: state.items.map((item) => item.id === target.id ? { ...item, [field]: ['score', 'effort'].includes(field) ? Number(value) : value } : item),
          });
        }

        function removeSelected() {
          const target = selectedItem();
          if (!target) return;
          const nextItems = state.items.filter((item) => item.id !== target.id);
          commit({
            ...state,
            items: nextItems,
            ui: { ...state.ui, selectedId: nextItems[0]?.id || null },
          });
          showToast(`Removed ${CONFIG.itemLabel}.`);
        }

        function exportState() {
          const blob = new Blob([JSON.stringify({ schema: `${CONFIG.slug}/v1`, ...state }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${CONFIG.slug}.json`;
          link.click();
          URL.revokeObjectURL(url);
          showToast('Downloaded backup.');
        }

        async function importState(file) {
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          commit({
            ...seedState(),
            ...parsed,
            ui: { ...seedState().ui, ...(parsed.ui || {}) },
          });
          showToast('Imported backup.');
        }

        document.addEventListener('click', (event) => {
          const itemButton = event.target.closest('.item');
          if (itemButton) {
            commit({ ...state, ui: { ...state.ui, selectedId: itemButton.dataset.id } });
            return;
          }

          const action = event.target.closest('[data-action]')?.dataset.action;
          if (!action) return;
          if (action === 'new') addItem();
          if (action === 'reset') { commit(seedState()); showToast('Re-seeded sample board.'); }
          if (action === 'remove-current') removeSelected();
          if (action === 'export') exportState();
          if (action === 'import') refs.importFile.click();
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
          if (event.target.closest('input, textarea, select')) return;
          if (event.key.toLowerCase() === 'n') {
            event.preventDefault();
            addItem();
          }
          if (event.key === '/') {
            event.preventDefault();
            refs.search.focus();
          }
        });

        render();
