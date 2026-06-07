const API_BASE = "https://ummedhorworker.naidu-hajira.workers.dev";

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("dhor_token") || "",
  user: null,
  portions: [],
  records: [],
  lastRecord: null,
  selectedVerifyStatus: "Pending"
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
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
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
    document.getElementById("portal-title").innerText = "Staff Portal";
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
  await loadPortions();
  await loadLatestRecordForForm();
  openDhorForm(state.lastRecord);
}

function logout() {
  localStorage.removeItem("dhor_token");
  localStorage.removeItem("dhor_portal_type");
  state.token = "";
  state.user = null;
  location.reload();
}

async function loadPortions() {
  const result = await apiPost("/api/dhor/portions", {}, state.token);
  if (!result.success) {
    alert(result.error || "Could not load portions.");
    return;
  }
  state.portions = result.portions || [];
  populatePortionSelect();
}

function populatePortionSelect() {
  const select = document.getElementById("dhor-portion");
  select.innerHTML = `<option value="">Select portion...</option>` + state.portions.map(p => {
    const label = `${p.juzno ? p.juzno + " · " : ""}${p.quarterjuzname}`;
    return `<option value="${escapeHtml(p.portionid)}" data-name="${escapeHtml(p.quarterjuzname)}">${escapeHtml(label)}</option>`;
  }).join("");
}

async function loadLatestRecordForForm() {
  const query = state.portalType === "student" ? {} : { username: "HIFDH1" };
  const result = await apiPost("/api/dhor/list", query, state.token);
  if (result.success && Array.isArray(result.records) && result.records.length) {
    state.lastRecord = result.records[0];
  } else {
    state.lastRecord = null;
  }
}

function openDhorForm(record = null) {
  const screen = document.getElementById("dhor-form-screen");
  screen.classList.toggle("student-theme", state.portalType === "student");
  screen.classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-form-title").innerText = "Record Dhor";
  document.getElementById("dhor-form-message").innerText = "";

  document.getElementById("dhor-id").value = "";
  document.getElementById("dhor-date").value = todayString();
  document.getElementById("dhor-portion").value = record ? record.portionid : "";
  document.getElementById("dhor-mistakes").value = record ? record.mistakesNumber : "";
  document.getElementById("dhor-minutes").value = record ? record.readingMinutes : "";
  document.getElementById("dhor-comments").value = record ? record.comments : "";

  const nameInput = document.getElementById("dhor-username");
  nameInput.value = record ? record.username : (state.portalType === "student" ? state.user.username : "Umme");
  nameInput.readOnly = state.portalType === "student";

  ["dhor-portion", "dhor-mistakes", "dhor-minutes", "dhor-comments"].forEach(id => {
    document.getElementById(id).classList.toggle("prefilled-field", !!record);
  });

  state.selectedVerifyStatus = record ? (record.verifyStatus || "Pending") : "Pending";
  document.getElementById("admin-verification-box").classList.toggle("hidden", state.portalType !== "admin");
  renderVerifyButtons();

  showScreen("dhor-form-screen");
}

function selectVerifyStatus(status) {
  state.selectedVerifyStatus = status;
  renderVerifyButtons();
}

function renderVerifyButtons() {
  const needs = document.getElementById("verify-needs-work");
  const tops = document.getElementById("verify-tops");
  if (!needs || !tops) return;

  const needsSelected = state.selectedVerifyStatus === "Needs Review";
  const topsSelected = state.selectedVerifyStatus === "Verified";

  needs.classList.toggle("is-selected", needsSelected);
  tops.classList.toggle("is-selected", topsSelected);
  needs.innerText = needsSelected ? "👎" : "Needs Work";
  tops.innerText = topsSelected ? "👍" : "Tops Alhamdulillah";
}

async function saveDhorEntry() {
  const portionSelect = document.getElementById("dhor-portion");
  const option = portionSelect.options[portionSelect.selectedIndex];
  const record = {
    date: document.getElementById("dhor-date").value,
    username: document.getElementById("dhor-username").value.trim(),
    portionid: portionSelect.value,
    quarterjuzname: option ? option.dataset.name || option.textContent : "",
    mistakesNumber: Number(document.getElementById("dhor-mistakes").value || 0),
    readingMinutes: Number(document.getElementById("dhor-minutes").value || 0),
    comments: document.getElementById("dhor-comments").value.trim(),
    verifyStatus: state.portalType === "admin" ? state.selectedVerifyStatus : "Pending"
  };

  if (!record.date) return showFormMessage("Please select a date.");
  if (!record.portionid) return showFormMessage("Please select a portion.");
  if (!record.username) return showFormMessage("Please enter the name.");

  const button = document.getElementById("save-dhor-btn");
  button.disabled = true;
  button.innerText = "Saving...";
  const result = await apiPost("/api/dhor/save", record, state.token);
  button.disabled = false;
  button.innerText = "Save Dhor Entry";

  if (!result.success) return showFormMessage(result.error || "Could not save entry.");
  showFormMessage("Saved successfully.");
  await loadLatestRecordForForm();
}

function showFormMessage(message) {
  document.getElementById("dhor-form-message").innerText = message;
}

async function openDhorList() {
  const screen = document.getElementById("dhor-list-screen");
  screen.classList.toggle("student-theme", state.portalType === "student");
  screen.classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("admin-filter-box").classList.toggle("hidden", state.portalType !== "admin");
  showScreen("dhor-list-screen");
  await loadDhorRecords();
}

async function loadDhorRecords() {
  const body = state.portalType === "admin" ? { username: document.getElementById("admin-username-filter").value.trim() } : {};
  const result = await apiPost("/api/dhor/list", body, state.token);
  if (!result.success) {
    document.getElementById("dhor-record-list").innerHTML = `<p class="error-message">${escapeHtml(result.error || "Could not load records.")}</p>`;
    return;
  }
  state.records = result.records || [];
  renderDhorSummary();
  renderDhorRecords();
}

function renderDhorSummary() {
  const records = state.records;
  const total = records.length;
  const verified = records.filter(r => r.verifyStatus === "Verified").length;
  const review = records.filter(r => r.verifyStatus === "Needs Review").length;
  document.getElementById("dhor-summary").innerHTML = `
    <div class="summary-card"><span class="summary-number">${total}</span><span>Total</span></div>
    <div class="summary-card"><span class="summary-number">${verified}</span><span>Tops</span></div>
    <div class="summary-card"><span class="summary-number">${review}</span><span>Needs Work</span></div>
  `;
}

function renderDhorRecords() {
  const box = document.getElementById("dhor-record-list");
  if (!state.records.length) {
    box.innerHTML = `<p class="helper-text">No Dhor records found.</p>`;
    return;
  }

  box.innerHTML = state.records.map(record => {
    const statusClass = record.verifyStatus === "Verified" ? "status-verified" : record.verifyStatus === "Needs Review" ? "status-review" : "status-pending";
    const adminActions = state.portalType === "admin" ? `
      <div class="card-actions">
        <button class="verify-choice-btn ${record.verifyStatus === "Needs Review" ? "is-selected" : ""}" onclick="setVerifyStatus('${escapeJs(record.dhorid)}', 'Needs Review')">${record.verifyStatus === "Needs Review" ? "👎" : "Needs Work"}</button>
        <button class="verify-choice-btn ${record.verifyStatus === "Verified" ? "is-selected" : ""}" onclick="setVerifyStatus('${escapeJs(record.dhorid)}', 'Verified')">${record.verifyStatus === "Verified" ? "👍" : "Tops Alhamdulillah"}</button>
      </div>` : "";
    return `
      <div class="dhor-card">
        <div class="dhor-card-title">${escapeHtml(record.quarterjuzname || record.portionid)} · ${escapeHtml(record.date)}</div>
        <div class="dhor-meta">
          <strong>Name:</strong> ${escapeHtml(record.username)}<br>
          <strong>Mistakes:</strong> ${escapeHtml(record.mistakesNumber)} · <strong>Minutes:</strong> ${escapeHtml(record.readingMinutes)}<br>
          ${record.comments ? `<strong>Comments:</strong> ${escapeHtml(record.comments)}<br>` : ""}
          <span class="status-pill ${statusClass}">${escapeHtml(record.verifyStatus || "Pending")}</span>
          ${record.verifyDate ? `<span class="status-pill status-pending">${escapeHtml(record.verifyDate)}</span>` : ""}
        </div>
        ${adminActions}
      </div>`;
  }).join("");
}

async function setVerifyStatus(dhorid, verifyStatus) {
  const result = await apiPost("/api/dhor/verify", { dhorid, verifyStatus }, state.token);
  if (!result.success) return alert(result.error || "Could not update status.");
  await loadDhorRecords();
}

function todayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value) {
  return String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
