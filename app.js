const STORAGE_KEY = "goodshotz-aucitya-project-hub-v2";
const SYNC_CONFIG = window.GS_PROJECT_SYNC || {};

const defaultState = {
  meta: {
    updatedAt: new Date().toISOString(),
    updatedBy: randomId()
  },
  projects: []
};

let state = loadState();
let activeView = "dashboard";
let suppressCloudSave = false;
let toastTimer;
let cloudClient;
let cloudChannel;

const els = {
  nav: document.querySelector(".view-nav"),
  metrics: document.querySelector("[data-metrics]"),
  projectCards: document.querySelector("[data-project-cards]"),
  projectBoard: document.querySelector("[data-project-board]"),
  upcoming: document.querySelector("[data-upcoming-milestones]"),
  gantt: document.querySelector("[data-gantt]"),
  taskBoard: document.querySelector("[data-task-board]"),
  budgetBoard: document.querySelector("[data-budget-board]"),
  strategyBoard: document.querySelector("[data-strategy-board]"),
  lastSaved: document.querySelector("[data-last-saved]"),
  projectModal: document.querySelector("[data-project-modal]"),
  projectForm: document.querySelector("[data-project-form]"),
  projectModalTitle: document.querySelector("[data-project-modal-title]"),
  taskModal: document.querySelector("[data-task-modal]"),
  taskForm: document.querySelector("[data-task-form]"),
  milestoneModal: document.querySelector("[data-milestone-modal]"),
  milestoneForm: document.querySelector("[data-milestone-form]"),
  projectOptions: document.querySelectorAll("[data-project-options]"),
  importFile: document.querySelector("[data-import-file]"),
  toast: document.querySelector("[data-toast]"),
  syncDot: document.querySelector("[data-sync-dot]"),
  syncTitle: document.querySelector("[data-sync-title]"),
  syncCopy: document.querySelector("[data-sync-copy]")
};

const channel = "BroadcastChannel" in window ? new BroadcastChannel(STORAGE_KEY) : null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return clone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch {
    return clone(defaultState);
  }
}

function normalizeState(nextState) {
  const normalized = {
    meta: { ...defaultState.meta, ...(nextState.meta || {}) },
    projects: Array.isArray(nextState.projects) ? nextState.projects : []
  };

  normalized.projects = normalized.projects.map((project) => ({
    ...project,
    tasks: Array.isArray(project.tasks) ? project.tasks : [],
    milestones: Array.isArray(project.milestones) ? project.milestones : []
  }));

  return normalized;
}

function saveState({ broadcast = true, cloud = true } = {}) {
  state.meta.updatedAt = new Date().toISOString();
  state.meta.updatedBy = state.meta.updatedBy || randomId();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (broadcast && channel) channel.postMessage(state);
  if (cloud && !suppressCloudSave) scheduleCloudSave();
  render();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix) {
  return `${prefix}-${randomId().slice(0, 8)}`;
}

function projectProgress(project) {
  const items = [...project.tasks, ...project.milestones];
  if (!items.length) return project.status === "done" ? 100 : 0;
  const done = items.filter((item) => item.status === "done").length;
  return Math.round((done / items.length) * 100);
}

function allTasks() {
  return state.projects.flatMap((project) => project.tasks.map((task) => ({ ...task, project })));
}

function allMilestones() {
  return state.projects.flatMap((project) => project.milestones.map((milestone) => ({ ...milestone, project })));
}

function statusLabel(status) {
  return {
    planning: "Planning",
    active: "Active",
    watch: "Watch",
    done: "Done",
    todo: "To do",
    doing: "Doing",
    upcoming: "Upcoming"
  }[status] || status;
}

function setView(view) {
  activeView = view;
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.view === view);
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const isActive = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function render() {
  renderProjectOptions();
  renderMetrics();
  renderProjectCards();
  renderProjectBoard();
  renderMilestones();
  renderGantt();
  renderTasks();
  renderBudget();
  renderStrategy();
  els.lastSaved.textContent = `Saved ${new Date(state.meta.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  setView(activeView);
}

function renderMetrics() {
  const projects = state.projects;
  const tasks = allTasks();
  const milestones = allMilestones();
  const budget = projects.reduce((sum, project) => sum + Number(project.budget || 0), 0);
  const spent = projects.reduce((sum, project) => sum + Number(project.spent || 0), 0);
  const active = projects.filter((project) => project.status !== "done").length;
  const openTasks = tasks.filter((task) => task.status !== "done").length;
  const nextMilestone = milestones.filter((milestone) => milestone.status !== "done").sort((a, b) => a.due.localeCompare(b.due))[0];

  const cards = [
    ["Active projects", active, "Across growth, creative, ops, finance, and family"],
    ["Open tasks", openTasks, `${tasks.filter((task) => task.status === "doing").length} currently in motion`],
    ["Budget used", `${budget ? Math.round((spent / budget) * 100) : 0}%`, `${formatCurrency(spent)} of ${formatCurrency(budget)}`],
    ["Next milestone", nextMilestone ? formatDate(nextMilestone.due).replace(" 2026", "") : "Clear", nextMilestone ? nextMilestone.title : "No upcoming milestone"]
  ];

  els.metrics.innerHTML = cards.map(([label, value, copy], index) => `
    <article class="metric-card" style="background:${["#f7c8d8", "#bfe5ff", "#bfebd5", "#f5e8a8"][index]}99">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${copy}</p>
    </article>
  `).join("");
}

function renderProjectCards() {
  const projects = state.projects
    .filter((project) => project.status !== "done")
    .slice(0, 4);

  els.projectCards.innerHTML = projects.length
    ? projects.map(projectCard).join("")
    : emptyState("No projects yet", "Add your first project to start the shared dashboard.");
}

function renderProjectBoard() {
  els.projectBoard.innerHTML = state.projects.length
    ? state.projects.map(projectCard).join("")
    : emptyState("No projects yet", "Create the first project and it will become the first visible entry.");
}

function projectCard(project) {
  const progress = projectProgress(project);
  const remaining = Math.max(0, Number(project.budget || 0) - Number(project.spent || 0));
  return `
    <article class="project-card" data-project-id="${project.id}">
      <header>
        <div>
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.note || "")}</p>
        </div>
        <span class="color-chip" style="background:${project.color}" aria-hidden="true"></span>
      </header>
      <div class="tag-row">
        <span class="tag">${escapeHtml(project.owner)}</span>
        <span class="tag">${escapeHtml(project.strategy)}</span>
        <span class="tag">${statusLabel(project.status)}</span>
      </div>
      <div class="progress" aria-label="${progress}% complete">
        <span style="width:${progress}%"></span>
      </div>
      <div class="project-meta">
        <div><span>Timeline</span><strong>${formatDate(project.start).replace(" 2026", "")} → ${formatDate(project.end).replace(" 2026", "")}</strong></div>
        <div><span>Budget left</span><strong>${formatCurrency(remaining)}</strong></div>
        <div><span>Progress</span><strong>${progress}%</strong></div>
      </div>
      <button class="text-button" type="button" data-action="edit-project" data-id="${project.id}">Edit project</button>
    </article>
  `;
}

function renderMilestones() {
  const milestones = allMilestones()
    .filter((milestone) => milestone.status !== "done")
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 8);

  els.upcoming.innerHTML = milestones.length ? milestones.map((milestone) => `
    <article class="milestone-item">
      <strong>${escapeHtml(milestone.title)}</strong>
      <time>${formatDate(milestone.due)} · ${escapeHtml(milestone.project.name)}</time>
    </article>
  `).join("") : `<p>No upcoming milestones. Quietly satisfying.</p>`;
}

function renderGantt() {
  if (!state.projects.length) {
    els.gantt.innerHTML = emptyState("No timeline yet", "Add a project first, then its date range will appear here.");
    els.gantt.style.setProperty("--month-count", 1);
    return;
  }

  const starts = state.projects.map((project) => project.start).sort();
  const ends = state.projects.map((project) => project.end).sort();
  const start = starts[0] || todayISO();
  const end = ends[ends.length - 1] || todayISO();
  const totalDays = daysBetween(start, end);
  const months = monthsBetween(start, end);

  els.gantt.style.setProperty("--month-count", months.length);
  els.gantt.innerHTML = `
    <div class="gantt-header">
      <span>Project</span>
      <div class="gantt-months">${months.map((month) => `<span>${month}</span>`).join("")}</div>
    </div>
    ${state.projects.map((project) => {
      const left = Math.max(0, (daysBetween(start, project.start) / totalDays) * 100);
      const width = Math.max(3, (daysBetween(project.start, project.end) / totalDays) * 100);
      const markers = project.milestones.map((milestone) => {
        const dotLeft = Math.max(0, Math.min(100, (daysBetween(start, milestone.due) / totalDays) * 100));
        return `<span class="gantt-milestone" style="--dot-left:${dotLeft}%" title="${escapeHtml(milestone.title)}"></span>`;
      }).join("");
      return `
        <div class="gantt-row">
          <div class="gantt-label">
            <strong>${escapeHtml(project.name)}</strong>
            <span>${escapeHtml(project.owner)} · ${formatDate(project.start).replace(" 2026", "")} to ${formatDate(project.end).replace(" 2026", "")}</span>
          </div>
          <div class="gantt-track">
            <span class="gantt-bar" style="--bar-left:${left}%;--bar-width:${width}%;--bar-color:${project.color}"></span>
            ${markers}
          </div>
        </div>
      `;
    }).join("")}
  `;
}

function monthsBetween(start, end) {
  const result = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00`);
  const last = new Date(`${end.slice(0, 7)}-01T00:00:00`);
  while (cursor <= last) {
    result.push(new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function renderTasks() {
  const groups = [
    ["todo", "To do"],
    ["doing", "Doing"],
    ["done", "Done"]
  ];

  els.taskBoard.innerHTML = groups.map(([status, label]) => {
    const tasks = allTasks().filter((task) => task.status === status);
    return `
      <section class="kanban-column">
        <h3>${label} · ${tasks.length}</h3>
        <div class="task-stack">
          ${tasks.map(taskCard).join("") || `<p>No tasks here.</p>`}
        </div>
      </section>
    `;
  }).join("");
}

function taskCard(task) {
  return `
    <article class="task-card">
      <strong>${escapeHtml(task.title)}</strong>
      <p>${escapeHtml(task.project.name)}</p>
      <div class="tag-row">
        <span class="tag">${escapeHtml(task.owner)}</span>
        <span class="tag">${formatDate(task.due).replace(" 2026", "")}</span>
      </div>
      ${task.status !== "done" ? `<button class="text-button" type="button" data-action="complete-task" data-project-id="${task.project.id}" data-task-id="${task.id}">Mark done</button>` : ""}
    </article>
  `;
}

function renderBudget() {
  const budget = state.projects.reduce((sum, project) => sum + Number(project.budget || 0), 0);
  const spent = state.projects.reduce((sum, project) => sum + Number(project.spent || 0), 0);
  const remaining = budget - spent;

  els.budgetBoard.innerHTML = `
    <aside class="budget-summary">
      <h3>Total portfolio</h3>
      <strong>${formatCurrency(budget)}</strong>
      <p>${formatCurrency(spent)} spent · ${formatCurrency(remaining)} remaining</p>
      <div class="progress"><span style="width:${budget ? Math.min(100, (spent / budget) * 100) : 0}%"></span></div>
    </aside>
    <div class="budget-table">
      ${state.projects.length ? state.projects.map((project) => {
        const used = project.budget ? Math.round((Number(project.spent || 0) / Number(project.budget)) * 100) : 0;
        return `
          <article class="budget-row">
            <strong>${escapeHtml(project.name)}</strong>
            <span>${formatCurrency(project.budget)}</span>
            <span>${formatCurrency(project.spent)}</span>
            <span>${used}% used</span>
          </article>
        `;
      }).join("") : emptyState("No budgets yet", "Create a project and add its budget to see it here.")}
    </div>
  `;
}

function renderStrategy() {
  const strategies = ["Growth", "Operations", "Creative", "Finance", "Family"];
  els.strategyBoard.innerHTML = strategies.map((strategy, index) => {
    const projects = state.projects.filter((project) => project.strategy === strategy);
    return `
      <article class="strategy-card" style="background:${["#f7c8d899", "#bfebd599", "#bfe5ff99", "#f5e8a899", "#d9ccff99"][index]}">
        <h3>${strategy}</h3>
        <p>${strategyCopy(strategy)}</p>
        <ul>
          ${projects.map((project) => `<li>${escapeHtml(project.name)}</li>`).join("") || "<li>No project yet</li>"}
        </ul>
      </article>
    `;
  }).join("");
}

function strategyCopy(strategy) {
  return {
    Growth: "Revenue, audience, partnerships, and market-facing bets.",
    Operations: "Systems, admin, vendors, documents, and smoother repeat work.",
    Creative: "Content, learning products, tours, visual identity, and storytelling.",
    Finance: "Budgets, cashflow, profitability, savings, and reserves.",
    Family: "Shared home priorities, personal plans, and non-work commitments."
  }[strategy];
}

function renderProjectOptions() {
  const options = state.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
  els.projectOptions.forEach((select) => {
    select.innerHTML = options;
  });
}

function emptyState(title, copy) {
  return `
    <article class="empty-state">
      <strong>${title}</strong>
      <p>${copy}</p>
    </article>
  `;
}

function openProjectModal(projectId) {
  const form = els.projectForm;
  form.reset();
  const project = state.projects.find((item) => item.id === projectId);
  els.projectModalTitle.textContent = project ? "Edit project" : "New project";
  form.querySelector("[data-action='delete-project']").style.visibility = project ? "visible" : "hidden";

  if (project) {
    Object.entries(project).forEach(([key, value]) => {
      const field = form.elements[key];
      if (field && typeof value !== "object") field.value = value;
    });
  } else {
    form.elements.id.value = "";
    form.elements.start.value = todayISO();
    form.elements.end.value = todayISO();
    form.elements.budget.value = 100000;
    form.elements.spent.value = 0;
    form.elements.color.value = "#f2a7bd";
  }

  els.projectModal.showModal();
}

function saveProject(formData) {
  const id = formData.get("id") || uid("p");
  const payload = {
    id,
    name: String(formData.get("name")).trim(),
    owner: String(formData.get("owner")),
    strategy: String(formData.get("strategy")),
    status: String(formData.get("status")),
    start: String(formData.get("start")),
    end: String(formData.get("end")),
    budget: Number(formData.get("budget") || 0),
    spent: Number(formData.get("spent") || 0),
    color: String(formData.get("color")),
    note: String(formData.get("note") || "").trim()
  };

  if (payload.end < payload.start) {
    showToast("End date needs to be after the start date.");
    return;
  }

  const existing = state.projects.find((project) => project.id === id);
  if (existing) {
    Object.assign(existing, payload);
  } else {
    state.projects.push({
      ...payload,
      tasks: [],
      milestones: []
    });
  }

  els.projectModal.close();
  saveState();
  showToast("Project saved.");
}

function saveTask(formData) {
  const project = state.projects.find((item) => item.id === formData.get("projectId"));
  if (!project) {
    showToast("Add a project first.");
    return;
  }
  project.tasks.push({
    id: uid("t"),
    title: String(formData.get("title")).trim(),
    owner: String(formData.get("owner")),
    due: String(formData.get("due")),
    status: String(formData.get("status"))
  });
  els.taskModal.close();
  saveState();
  showToast("Task added.");
}

function saveMilestone(formData) {
  const project = state.projects.find((item) => item.id === formData.get("projectId"));
  if (!project) {
    showToast("Add a project first.");
    return;
  }
  project.milestones.push({
    id: uid("m"),
    title: String(formData.get("title")).trim(),
    due: String(formData.get("due")),
    status: String(formData.get("status"))
  });
  els.milestoneModal.close();
  saveState();
  showToast("Milestone added.");
}

function deleteProject() {
  const id = els.projectForm.elements.id.value;
  if (!id) return;
  state.projects = state.projects.filter((project) => project.id !== id);
  els.projectModal.close();
  saveState();
  showToast("Project deleted.");
}

function completeTask(projectId, taskId) {
  const project = state.projects.find((item) => item.id === projectId);
  const task = project?.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = "done";
  saveState();
}

async function exportSnapshot() {
  const snapshot = JSON.stringify(state, null, 2);
  try {
    await navigator.clipboard.writeText(snapshot);
    showToast("Snapshot copied. Paste it on the other device to import.");
  } catch {
    const blob = new Blob([snapshot], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "goodshotz-aucitya-projects.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Snapshot downloaded.");
  }
}

function importSnapshot(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      saveState();
      showToast("Imported project hub data.");
    } catch {
      showToast("That file did not look like a project snapshot.");
    }
  };
  reader.readAsText(file);
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

let cloudSaveTimer;

function scheduleCloudSave() {
  if (!cloudClient) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    await cloudClient
      .from("project_rooms")
      .upsert({
        room_id: SYNC_CONFIG.roomId,
        payload: state,
        updated_at: state.meta.updatedAt
      });
  }, 450);
}

async function initCloudSync() {
  if (!SYNC_CONFIG.supabaseUrl || !SYNC_CONFIG.supabaseAnonKey) return;

  try {
    await loadSupabaseScript();
    cloudClient = window.supabase.createClient(SYNC_CONFIG.supabaseUrl, SYNC_CONFIG.supabaseAnonKey);

    const { data } = await cloudClient
      .from("project_rooms")
      .select("payload,updated_at")
      .eq("room_id", SYNC_CONFIG.roomId)
      .maybeSingle();

    if (data?.payload && data.updated_at > state.meta.updatedAt) {
      suppressCloudSave = true;
      state = normalizeState(data.payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      suppressCloudSave = false;
      render();
    } else {
      scheduleCloudSave();
    }

    cloudChannel = cloudClient
      .channel(`project-room-${SYNC_CONFIG.roomId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "project_rooms",
        filter: `room_id=eq.${SYNC_CONFIG.roomId}`
      }, (payload) => {
        const nextPayload = payload.new?.payload;
        if (!nextPayload || nextPayload.meta?.updatedBy === state.meta.updatedBy) return;
        if (nextPayload.meta?.updatedAt <= state.meta.updatedAt) return;
        suppressCloudSave = true;
        state = normalizeState(nextPayload);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        suppressCloudSave = false;
        render();
        showToast("Live update received.");
      })
      .subscribe();

    els.syncDot.classList.add("is-cloud");
    els.syncTitle.textContent = "Cloud live";
    els.syncCopy.textContent = "Realtime room sync is connected.";
  } catch (error) {
    els.syncTitle.textContent = "Local live";
    els.syncCopy.textContent = "Cloud sync needs Supabase settings.";
  }
}

function loadSupabaseScript() {
  return new Promise((resolve, reject) => {
    if (window.supabase) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

els.nav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-target]");
  if (!button) return;
  setView(button.dataset.viewTarget);
});

document.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  const { action, id, projectId, taskId } = actionEl.dataset;
  if (action === "add-project") openProjectModal();
  if (action === "edit-project") openProjectModal(id);
  if (action === "close-modal") els.projectModal.close();
  if (action === "delete-project") deleteProject();
  if (action === "add-task") {
    if (!state.projects.length) {
      showToast("Add a project first.");
      return;
    }
    els.taskForm.reset();
    els.taskForm.elements.due.value = todayISO();
    els.taskModal.showModal();
  }
  if (action === "close-task-modal") els.taskModal.close();
  if (action === "add-milestone") {
    if (!state.projects.length) {
      showToast("Add a project first.");
      return;
    }
    els.milestoneForm.reset();
    els.milestoneForm.elements.due.value = todayISO();
    els.milestoneModal.showModal();
  }
  if (action === "close-milestone-modal") els.milestoneModal.close();
  if (action === "complete-task") completeTask(projectId, taskId);
  if (action === "export") exportSnapshot();
  if (action === "import") els.importFile.click();
});

els.projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveProject(new FormData(els.projectForm));
});

els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTask(new FormData(els.taskForm));
});

els.milestoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveMilestone(new FormData(els.milestoneForm));
});

els.importFile.addEventListener("change", (event) => {
  importSnapshot(event.target.files[0]);
  event.target.value = "";
});

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  state = normalizeState(JSON.parse(event.newValue));
  render();
});

if (channel) {
  channel.addEventListener("message", (event) => {
    if (event.data?.meta?.updatedAt <= state.meta.updatedAt) return;
    state = normalizeState(event.data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  });
}

render();
initCloudSync();
