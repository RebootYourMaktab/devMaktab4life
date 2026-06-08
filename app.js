const API_BASE = "https://ummedhorworker.naidu-hajira.workers.dev";

const CACHE_VERSION = "v1";
const DEFAULT_ADMIN_STUDENT_USERNAME = "HIFDH1";

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("dhor_token") || "",
  user: null,
  portions: [],
  records: [],
  pendingPortionId: "",
  currentCachedRecord: null
};

window.addEventListener("load", initApp);

function initApp() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  clearAuthBoxes();

  if (parts[0] === "admin" && parts[1]) {
    state.portalType = "admin";
    state.uniqueid = parts[1];
    setAuthTheme("admin");
    checkAdmin();
    return;
  }

  if (parts[0] === "u" && parts[1]) {
    state.portalType = "student";
    state.uniqueid = parts[1];
    setAuthTheme("student");
    checkStudent();
    return;
  }

  document.getElementById("portal-title").innerText = "Umme Dhor";
  document.getElementById("portal-subtitle").innerText = "Please open your personal login link.";
}

function setAuthTheme(type) {
  const screen = document.getElementById("auth-screen");
  screen.classList.remove("admin-theme", "student-theme");
  screen.classList.add(type === "admin" ? "admin-theme" : "student-theme");
}

function clearAuthBoxes() {
  document.getElementById("setup-pin-box").classList.add("hidden");
  document.getElementById("login-pin-box").classList.add("hidden");
  setError("");
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");
}

function setError(message) {
  document.getElementById("auth-error").innerText = message || "";
}

async function apiPost(path, body = {}, token = "") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return response.json();
}

async function checkStudent() {
  try {
    const result = await apiPost("/api/check-student", { uniqueid: state.uniqueid });
    if (!result.success) return setError(result.error || "Invalid student link");
    state.user = result.student;
    document.getElementById("portal-title").innerText = "Student Portal";
    document.getElementById("portal-subtitle").innerText = `Welcome ${result.student.username}`;
    document.getElementById(result.student.pinsetup ? "login-pin-box" : "setup-pin-box").classList.remove("hidden");
  } catch (err) {
    setError("Unable to connect. Please try again.");
  }
}

async function checkAdmin() {
  try {
    const result = await apiPost("/api/admin/check-admin", { uniqueid: state.uniqueid });
    if (!result.success) return setError(result.error || "Invalid admin link");
    state.user = result.admin;
    document.getElementById("portal-title").innerText = "ADMIN";
    document.getElementById("portal-subtitle").innerText = `${result.admin.username} · ${result.admin.role}`;
    document.getElementById(result.admin.pinsetup ? "login-pin-box" : "setup-pin-box").classList.remove("hidden");
  } catch (err) {
    setError("Unable to connect. Please try again.");
  }
}

async function submitSetupPin() {
  const pin = document.getElementById("setup-pin").value.trim();
  if (!/^\d{4}$/.test(pin)) return setError("PIN must be 4 digits.");
  const path = state.portalType === "admin" ? "/api/admin/setup-pin" : "/api/setup-pin";
  const result = await apiPost(path, { uniqueid: state.uniqueid, pin });
  if (!result.success) return setError(result.error || "Could not set PIN.");
  document.getElementById("setup-pin-box").classList.add("hidden");
  document.getElementById("login-pin-box").classList.remove("hidden");
  setError("PIN saved. Please log in.");
}

async function submitLogin() {
  const pin = document.getElementById("login-pin").value.trim();
  if (!/^\d{4}$/.test(pin)) return setError("PIN must be 4 digits.");
  const path = state.portalType === "admin" ? "/api/admin/login" : "/api/login";
  const result = await apiPost(path, { uniqueid: state.uniqueid, pin });
  if (!result.success) return setError(result.error || "Login failed.");

  state.token = result.token;
  state.user = state.portalType === "admin" ? result.admin : result.student;
  localStorage.setItem("dhor_token", state.token);
  localStorage.setItem("dhor_portal_type", state.portalType);

  // Speed improvement:
  // 1. Show the Dhor form immediately.
  // 2. Fill from local cache immediately.
  // 3. Refresh Google Sheet data quietly in the background.
  primeFromCache();
  showHome();
  refreshDhorDataInBackground();
}

function showHome() {
  openDhorForm();
}

function goHome() {
  showHome();
}

function logout() {
  localStorage.removeItem("dhor_token");
  localStorage.removeItem("dhor_portal_type");
  state.token = "";
  state.user = null;
  location.reload();
}

function cachePrefix() {
  const portal = state.portalType || "unknown";
  const userKey = state.uniqueid || (state.user && state.user.username) || "unknown";
  return `umme_dhor_${CACHE_VERSION}_${portal}_${userKey}`;
}

function cacheKey(name) {
  return `${cachePrefix()}_${name}`;
}

function getCache(name, fallback = null) {
  try {
    const raw = localStorage.getItem(cacheKey(name));
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function setCache(name, value) {
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify({
      savedAt: new Date().toISOString(),
      value
    }));
  } catch (err) {
    // If storage is full or blocked, the app still works online.
  }
}

function readCachedValue(name, fallback = null) {
  const cached = getCache(name, null);
  return cached && Object.prototype.hasOwnProperty.call(cached, "value")
    ? cached.value
    : fallback;
}

function primeFromCache() {
  const cachedPortions = readCachedValue("portions", []);
  if (Array.isArray(cachedPortions) && cachedPortions.length) {
    state.portions = cachedPortions;
    populatePortionSelect();
  }

  const cachedLatest = readCachedValue("latest_record", null);
  if (cachedLatest) {
    state.currentCachedRecord = cachedLatest;
  }
}

function setSyncStatus(message) {
  const target = document.getElementById("dhor-sync-status") || document.getElementById("dhor-form-message");
  if (target) target.innerText = message || "";
}

async function refreshDhorDataInBackground() {
  setSyncStatus("Loading latest saved record...");
  await Promise.allSettled([
    loadPortions({ silent: true }),
    loadLatestRecord({ silent: true })
  ]);

  if (isDhorFormActive()) {
    const latest = state.currentCachedRecord;
    if (latest) applyRecordToForm(latest, true);
    setSyncStatus("Latest record loaded.");
  }
}

function isDhorFormActive() {
  const form = document.getElementById("dhor-form-screen");
  return form && form.classList.contains("active");
}

async function loadPortions(options = {}) {
  const result = await apiPost("/api/dhor/portions", {}, state.token);
  if (!result.success) {
    if (!options.silent) alert(result.error || "Could not load portions.");
    return;
  }
  state.portions = result.portions || [];
  setCache("portions", state.portions);
  populatePortionSelect();
}

function populatePortionSelect() {
  const select = document.getElementById("dhor-portion");
  if (!select) return;

  select.innerHTML = `<option value="">Select portion...</option>` + state.portions.map(p => {
    const juz = p.juzno ? `${p.juzno} · ` : "";
    const label = `${juz}${p.quarterjuzname || ""}`;
    return `<option value="${escapeHtml(p.portionid)}" data-name="${escapeHtml(p.quarterjuzname)}">${escapeHtml(label)}</option>`;
  }).join("");

  if (state.pendingPortionId) {
    select.value = state.pendingPortionId;
  }
}

function getActiveRecordUsername() {
  if (state.portalType === "student") return state.user && state.user.username ? state.user.username : "";
  const field = document.getElementById("dhor-username");
  return field && field.value.trim() ? field.value.trim() : DEFAULT_ADMIN_STUDENT_USERNAME;
}

async function loadLatestRecord(options = {}) {
  const body = state.portalType === "admin"
    ? { username: getActiveRecordUsername() }
    : {};

  const result = await apiPost("/api/dhor/list", body, state.token);
  if (!result.success) {
    if (!options.silent) showFormMessage(result.error || "Could not load latest record.");
    return;
  }

  const records = result.records || [];
  state.records = records;
  const latest = getNewestRecord(records);
  if (latest) {
    state.currentCachedRecord = latest;
    setCache("latest_record", latest);
  }
}

function getNewestRecord(records) {
  if (!Array.isArray(records) || !records.length) return null;
  return [...records].sort((a, b) => {
    const dateA = Date.parse(a.date || "") || 0;
    const dateB = Date.parse(b.date || "") || 0;
    if (dateA !== dateB) return dateB - dateA;
    return String(b.dhorid || "").localeCompare(String(a.dhorid || ""), undefined, { numeric: true });
  })[0];
}

function openDhorForm(record = null) {
  const formScreen = document.getElementById("dhor-form-screen");
  formScreen.classList.toggle("student-theme", state.portalType === "student");
  formScreen.classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-form-title").innerText = "Record Dhor";
  document.getElementById("dhor-form-message").innerText = "";

  const cached = !record ? state.currentCachedRecord : null;
  const recordToUse = record || cached || null;

  document.getElementById("dhor-id").value = ""; // Every save creates a new row.
  document.getElementById("dhor-date").value = recordToUse && recordToUse.date ? recordToUse.date : todayString();
  document.getElementById("dhor-mistakes").value = recordToUse ? recordToUse.mistakesNumber || "" : "";
  document.getElementById("dhor-minutes").value = recordToUse ? recordToUse.readingMinutes || "" : "";
  document.getElementById("dhor-comments").value = recordToUse ? recordToUse.comments || "" : "";

  const usernameInput = document.getElementById("dhor-username");
  const usernameLabel = document.getElementById("dhor-username-label");
  const statusLabel = document.getElementById("dhor-status-label");
  const statusSelect = document.getElementById("dhor-status");

  if (state.portalType === "student") {
    usernameInput.value = state.user.username;
    usernameInput.classList.add("hidden");
    usernameLabel.classList.add("hidden");
    statusSelect.classList.add("hidden");
    statusLabel.classList.add("hidden");
  } else {
    usernameInput.value = recordToUse && recordToUse.username ? recordToUse.username : DEFAULT_ADMIN_STUDENT_USERNAME;
    usernameInput.classList.remove("hidden");
    usernameLabel.classList.remove("hidden");
    statusSelect.classList.remove("hidden");
    statusLabel.classList.remove("hidden");
  }

  const statusValue = recordToUse && recordToUse.verifyStatus ? recordToUse.verifyStatus : "Pending";
  statusSelect.value = statusValue;

  const portionId = recordToUse && recordToUse.portionid ? recordToUse.portionid : "";
  state.pendingPortionId = portionId;
  const portionSelect = document.getElementById("dhor-portion");
  if (portionSelect) portionSelect.value = portionId;

  markPrefilledFields(Boolean(cached && !record));
  showScreen("dhor-form-screen");

  if (!state.portions.length) {
    setSyncStatus(cached ? "Showing saved copy while refreshing..." : "Loading portions...");
  }
}

function applyRecordToForm(record, fromBackgroundRefresh = false) {
  if (!record) return;
  state.currentCachedRecord = record;
  state.pendingPortionId = record.portionid || "";
  document.getElementById("dhor-date").value = record.date || todayString();
  document.getElementById("dhor-mistakes").value = record.mistakesNumber || "";
  document.getElementById("dhor-minutes").value = record.readingMinutes || "";
  document.getElementById("dhor-comments").value = record.comments || "";
  document.getElementById("dhor-portion").value = record.portionid || "";
  if (state.portalType === "admin") document.getElementById("dhor-username").value = record.username || DEFAULT_ADMIN_STUDENT_USERNAME;
  markPrefilledFields(fromBackgroundRefresh);
}

function markPrefilledFields(isPrefilled) {
  ["dhor-date", "dhor-portion", "dhor-mistakes", "dhor-minutes", "dhor-comments"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("prefilled-field", isPrefilled);
  });
}

async function saveDhorEntry() {
  const portionSelect = document.getElementById("dhor-portion");
  const option = portionSelect.options[portionSelect.selectedIndex];
  const record = {
    dhorid: "", // Backend assigns the next sequential DhorID.
    date: document.getElementById("dhor-date").value,
    username: document.getElementById("dhor-username").value.trim(),
    portionid: portionSelect.value,
    quarterjuzname: option ? option.dataset.name || option.textContent : "",
    mistakesNumber: Number(document.getElementById("dhor-mistakes").value || 0),
    readingMinutes: Number(document.getElementById("dhor-minutes").value || 0),
    comments: document.getElementById("dhor-comments").value.trim(),
    verifyStatus: document.getElementById("dhor-status").value || "Pending"
  };

  if (!record.date) return showFormMessage("Please select a date.");
  if (!record.portionid) return showFormMessage("Please select a portion.");
  if (state.portalType === "admin" && !record.username) return showFormMessage("Please enter the student username.");

  const button = document.getElementById("save-dhor-btn");
  button.disabled = true;
  button.innerText = "Saving...";
  const result = await apiPost("/api/dhor/save", record, state.token);
  button.disabled = false;
  button.innerText = "Save Dhor Entry";

  if (!result.success) return showFormMessage(result.error || "Could not save entry.");

  const savedRecord = {
    ...record,
    dhorid: result.dhorid || record.dhorid,
    verifyStatus: record.verifyStatus || "Pending"
  };
  state.currentCachedRecord = savedRecord;
  setCache("latest_record", savedRecord);
  markPrefilledFields(false);
  showFormMessage("Saved successfully. You can save this again or update it.");
  setSyncStatus("Saved online.");
}

function showFormMessage(message) {
  document.getElementById("dhor-form-message").innerText = message;
}

async function openDhorList() {
  document.getElementById("dhor-list-screen").classList.toggle("student-theme", state.portalType === "student");
  document.getElementById("dhor-list-screen").classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-list-title").innerText = state.portalType === "admin" ? "Dhor Progress" : "My Dhor Progress";
  const adminFilter = document.getElementById("admin-filter-box");
  if (adminFilter) adminFilter.classList.toggle("hidden", state.portalType !== "admin");
  showScreen("dhor-list-screen");
  await loadDhorRecords();
}

async function loadDhorRecords() {
  const container = document.getElementById("dhor-record-list");
  container.innerHTML = `<p class="helper-text">Loading records...</p>`;
  const filter = document.getElementById("admin-username-filter");
  const body = state.portalType === "admin"
    ? { username: filter ? filter.value.trim() : "" }
    : {};
  const result = await apiPost("/api/dhor/list", body, state.token);
  if (!result.success) {
    container.innerHTML = `<p class="error-message">${escapeHtml(result.error || "Could not load records.")}</p>`;
    return;
  }
  state.records = result.records || [];
  const latest = getNewestRecord(state.records);
  if (latest) {
    state.currentCachedRecord = latest;
    setCache("latest_record", latest);
  }
  renderSummary(state.records);
  renderDhorRecords(state.records);
}

function renderSummary(records) {
  const total = records.length;
  const verified = records.filter(r => r.verifyStatus === "Verified").length;
  const mistakes = records.reduce((sum, r) => sum + Number(r.mistakesNumber || 0), 0);
  document.getElementById("dhor-summary").innerHTML = `
    <div class="summary-card"><span class="summary-number">${total}</span><span>Entries</span></div>
    <div class="summary-card"><span class="summary-number">${verified}</span><span>Verified</span></div>
    <div class="summary-card"><span class="summary-number">${mistakes}</span><span>Mistakes</span></div>
  `;
}

function renderDhorRecords(records) {
  const container = document.getElementById("dhor-record-list");
  if (!records.length) {
    container.innerHTML = `<p class="helper-text">No Dhor progress has been recorded yet.</p>`;
    return;
  }

  container.innerHTML = records.map(record => {
    const statusClass = record.verifyStatus === "Verified" ? "status-verified" : record.verifyStatus === "Needs Review" ? "status-review" : "status-pending";
    const adminVerify = state.portalType === "admin" ? `
      <button onclick="setVerifyStatus('${escapeForAttribute(record.dhorid)}', 'Verified')">Verify</button>
      <button onclick="setVerifyStatus('${escapeForAttribute(record.dhorid)}', 'Needs Review')">Review</button>
    ` : "";

    return `
      <div class="dhor-card">
        <div class="dhor-card-title">${escapeHtml(record.quarterjuzname || record.portionid)} · ${escapeHtml(record.date)}</div>
        <div class="dhor-meta">
          <strong>Student:</strong> ${escapeHtml(record.username)}<br>
          <strong>Mistakes:</strong> ${escapeHtml(record.mistakesNumber)} · <strong>Minutes:</strong> ${escapeHtml(record.readingMinutes)}<br>
          ${record.comments ? `<strong>Comments:</strong> ${escapeHtml(record.comments)}<br>` : ""}
          <span class="status-pill ${statusClass}">${escapeHtml(record.verifyStatus || "Pending")}</span>
        </div>
        <div class="card-actions">
          <button onclick="editRecord('${escapeForAttribute(record.dhorid)}')">Load</button>
          ${adminVerify}
        </div>
      </div>
    `;
  }).join("");
}

function editRecord(dhorid) {
  const record = state.records.find(r => r.dhorid === dhorid);
  if (record) openDhorForm(record);
}

async function setVerifyStatus(dhorid, verifyStatus) {
  const result = await apiPost("/api/dhor/verify", { dhorid, verifyStatus }, state.token);
  if (!result.success) return alert(result.error || "Could not update status.");
  await loadDhorRecords();
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeForAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
