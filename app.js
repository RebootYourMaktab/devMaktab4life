const API_BASE = "https://ummedhorworker.naidu-hajira.workers.dev";

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("dhor_token") || "",
  user: null,
  portions: [],
  records: []
};

const VERIFY_TOPS = "Tops Alhamdullilah";
const VERIFY_REVIEW = "Needs Review";
const DEFAULT_STUDENT_ID = "HIFDH1";
const DEFAULT_STUDENT_NAME = "Umme";

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
  await showHome();
}

async function showHome() {
  const lastRecord = await getLastDhorRecordForForm();
  openDhorForm(lastRecord, { fromLastRecord: !!lastRecord });
}

async function goHome() {
  await showHome();
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

function getDisplayName() {
  if (state.portalType === "student") return state.user?.username || DEFAULT_STUDENT_NAME;
  return DEFAULT_STUDENT_NAME;
}

async function getLastDhorRecordForForm() {
  try {
    const result = await apiPost("/api/dhor/list", {}, state.token);
    if (!result.success) return null;
    const records = result.records || [];
    state.records = records;

    if (state.portalType === "admin") {
      return records.find(r => sameStudent(r.username, DEFAULT_STUDENT_NAME))
        || records.find(r => sameStudent(r.username, DEFAULT_STUDENT_ID))
        || null;
    }

    const displayName = getDisplayName();
    return records.find(r => sameStudent(r.username, displayName)) || records[0] || null;
  } catch (err) {
    return null;
  }
}

function sameStudent(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function openDhorForm(record = null, options = {}) {
  const fromLastRecord = options.fromLastRecord === true;
  document.getElementById("dhor-form-screen").classList.toggle("student-theme", state.portalType === "student");
  document.getElementById("dhor-form-screen").classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-form-title").innerText = fromLastRecord ? "Record Dhor" : (record ? "Edit Dhor Entry" : "Record Dhor");
  document.getElementById("dhor-form-message").innerText = "";

  document.getElementById("dhor-id").value = fromLastRecord ? "" : (record ? record.dhorid : "");
  document.getElementById("dhor-date").value = fromLastRecord ? todayString() : (record ? record.date : todayString());
  document.getElementById("dhor-portion").value = record ? record.portionid : "";
  document.getElementById("dhor-mistakes").value = record ? record.mistakesNumber : "";
  document.getElementById("dhor-minutes").value = record ? record.readingMinutes : "";
  document.getElementById("dhor-comments").value = record ? record.comments : "";

  const startStatus = fromLastRecord ? "Pending" : normaliseVerifyStatus(record ? record.verifyStatus : "Pending");
  setFormVerifyStatus(startStatus);

  const usernameInput = document.getElementById("dhor-username");
  const usernameLabel = document.getElementById("dhor-username-label");
  const statusLabel = document.getElementById("dhor-status-label");
  const verificationRow = document.getElementById("dhor-form-verification-row");

  usernameInput.value = record && !fromLastRecord ? displayNameFromRecord(record.username) : getDisplayName();
  usernameInput.classList.remove("hidden");
  usernameLabel.classList.remove("hidden");
  usernameLabel.innerText = "Name";
  usernameInput.placeholder = "Student name";
  usernameInput.readOnly = state.portalType === "student";

  if (state.portalType === "admin") {
    verificationRow.classList.remove("hidden");
    statusLabel.classList.remove("hidden");
  } else {
    verificationRow.classList.add("hidden");
    statusLabel.classList.add("hidden");
  }

  markLastPortionFields(fromLastRecord);
  showScreen("dhor-form-screen");
}

function displayNameFromRecord(name) {
  return sameStudent(name, DEFAULT_STUDENT_ID) ? DEFAULT_STUDENT_NAME : (name || DEFAULT_STUDENT_NAME);
}

function markLastPortionFields(isPrefilled) {
  ["dhor-portion", "dhor-mistakes", "dhor-minutes", "dhor-comments"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("prefilled-last", isPrefilled);
  });
}

function setFormVerifyStatus(status) {
  const normalised = normaliseVerifyStatus(status);
  const hidden = document.getElementById("dhor-status");
  if (hidden) hidden.value = normalised;

  const reviewBtn = document.getElementById("verify-needs-btn");
  const topsBtn = document.getElementById("verify-tops-btn");
  if (!reviewBtn || !topsBtn) return;

  const reviewSelected = normalised === VERIFY_REVIEW;
  const topsSelected = normalised === VERIFY_TOPS;

  reviewBtn.classList.toggle("is-selected", reviewSelected);
  topsBtn.classList.toggle("is-selected", topsSelected);
  reviewBtn.innerText = reviewSelected ? "👎" : "Needs Works";
  topsBtn.innerText = topsSelected ? "👍" : VERIFY_TOPS;
}

async function saveDhorEntry() {
  const portionSelect = document.getElementById("dhor-portion");
  const option = portionSelect.options[portionSelect.selectedIndex];
  const record = {
    dhorid: document.getElementById("dhor-id").value.trim(),
    date: document.getElementById("dhor-date").value,
    username: displayNameFromRecord(document.getElementById("dhor-username").value.trim()),
    portionid: portionSelect.value,
    quarterjuzname: option ? option.dataset.name || option.textContent : "",
    mistakesNumber: Number(document.getElementById("dhor-mistakes").value || 0),
    readingMinutes: Number(document.getElementById("dhor-minutes").value || 0),
    comments: document.getElementById("dhor-comments").value.trim(),
    verifyStatus: document.getElementById("dhor-status").value || "Pending",
    verifyDate: normaliseVerifyStatus(document.getElementById("dhor-status").value) === "Pending" ? "" : todayString()
  };

  if (!record.date) return showFormMessage("Please select a date.");
  if (!record.portionid) return showFormMessage("Please select a portion.");
  if (state.portalType === "admin" && !record.username) return showFormMessage("Please enter the student name.");

  const button = document.getElementById("save-dhor-btn");
  button.disabled = true;
  button.innerText = "Saving...";
  const result = await apiPost("/api/dhor/save", record, state.token);
  button.disabled = false;
  button.innerText = "Save Dhor Entry";

  if (!result.success) return showFormMessage(result.error || "Could not save entry.");
  showFormMessage("Saved successfully.");
  document.getElementById("dhor-id").value = result.dhorid || record.dhorid || "";
}

function showFormMessage(message) {
  document.getElementById("dhor-form-message").innerText = message;
}

async function openDhorList() {
  document.getElementById("dhor-list-screen").classList.toggle("student-theme", state.portalType === "student");
  document.getElementById("dhor-list-screen").classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-list-title").innerText = state.portalType === "admin" ? "Dhor Progress" : "My Dhor Progress";
  document.getElementById("admin-filter-box").classList.toggle("hidden", state.portalType !== "admin");
  showScreen("dhor-list-screen");
  await loadDhorRecords();
}

async function loadDhorRecords() {
  const container = document.getElementById("dhor-record-list");
  container.innerHTML = `<p class="helper-text">Loading records...</p>`;
  const body = state.portalType === "admin"
    ? { username: document.getElementById("admin-username-filter").value.trim() }
    : {};
  const result = await apiPost("/api/dhor/list", body, state.token);
  if (!result.success) {
    container.innerHTML = `<p class="error-message">${escapeHtml(result.error || "Could not load records.")}</p>`;
    return;
  }
  state.records = result.records || [];
  renderSummary(state.records);
  renderDhorRecords(state.records);
}

function renderSummary(records) {
  const total = records.length;
  const verified = records.filter(r => normaliseVerifyStatus(r.verifyStatus) === VERIFY_TOPS).length;
  const mistakes = records.reduce((sum, r) => sum + Number(r.mistakesNumber || 0), 0);
  document.getElementById("dhor-summary").innerHTML = `
    <div class="summary-card"><span class="summary-number">${total}</span><span>Entries</span></div>
    <div class="summary-card"><span class="summary-number">${verified}</span><span>Tops</span></div>
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
    const currentStatus = normaliseVerifyStatus(record.verifyStatus);
    const statusClass = currentStatus === VERIFY_TOPS ? "status-verified" : currentStatus === VERIFY_REVIEW ? "status-review" : "status-pending";
    const statusDisplay = verifyDisplay(currentStatus);
    const adminVerify = state.portalType === "admin" ? `
      ${renderVerifyButton(record.dhorid, VERIFY_TOPS, currentStatus)}
      ${renderVerifyButton(record.dhorid, VERIFY_REVIEW, currentStatus)}
    ` : "";

    return `
      <div class="dhor-card">
        <div class="dhor-card-title">${escapeHtml(record.quarterjuzname || record.portionid)} · ${escapeHtml(record.date)}</div>
        <div class="dhor-meta">
          <strong>Name:</strong> ${escapeHtml(record.username)}<br>
          <strong>Mistakes:</strong> ${escapeHtml(record.mistakesNumber)} · <strong>Minutes:</strong> ${escapeHtml(record.readingMinutes)}<br>
          ${record.comments ? `<strong>Comments:</strong> ${escapeHtml(record.comments)}<br>` : ""}
          <span class="status-pill ${statusClass}">${escapeHtml(statusDisplay)}</span>
        </div>
        <div class="card-actions">
          <button onclick="editRecord('${escapeForAttribute(record.dhorid)}')">Edit</button>
        </div>
        ${adminVerify ? `<div class="verification-row">${adminVerify}</div>` : ""}
      </div>
    `;
  }).join("");
}

function renderVerifyButton(dhorid, status, currentStatus) {
  const selected = currentStatus === status;
  const icon = status === VERIFY_TOPS ? "👍" : "👎";
  const label = selected ? icon : status;
  return `<button class="verify-choice ${selected ? "is-selected" : ""}" onclick="setVerifyStatus('${escapeForAttribute(dhorid)}', '${escapeForAttribute(status)}')">${escapeHtml(label)}</button>`;
}

function verifyDisplay(status) {
  status = normaliseVerifyStatus(status);
  if (status === VERIFY_TOPS) return "👍";
  if (status === VERIFY_REVIEW) return "👎";
  return status || "Pending";
}

function normaliseVerifyStatus(status) {
  const text = String(status || "Pending").trim();
  if (text === "Verified" || text === "Needs Verified" || text === "Tops") return VERIFY_TOPS;
  if (["needs review", "needs works", "needs work"].includes(text.toLowerCase())) return VERIFY_REVIEW;
  if (text.toLowerCase() === "tops alhamdullilah") return VERIFY_TOPS;
  return text || "Pending";
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
