const API_BASE = "https://ummedhorworker.naidu-hajira.workers.dev";
const DEFAULT_STUDENT_ID = "HIFDH1";

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("dhor_token") || "",
  user: null,
  portions: [],
  records: []
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
    document.getElementById("portal-subtitle").innerText = `Welcome ${displayName(result.student)}`;
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
    document.getElementById("portal-subtitle").innerText = `${displayName(result.admin)} · ${result.admin.role}`;
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
  await startAtRecordDhor();
}

async function startAtRecordDhor() {
  await openDhorForm();
}

function goHome() {
  openDhorForm();
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

async function openDhorForm(record = null) {
  document.getElementById("dhor-form-screen").classList.toggle("student-theme", state.portalType === "student");
  document.getElementById("dhor-form-screen").classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-form-title").innerText = record ? "Edit Dhor Entry" : "Record Dhor";
  document.getElementById("dhor-form-message").innerText = "";

  const last = record ? null : await getLastEntryForCurrentStudent();
  const source = record || last || null;

  document.getElementById("dhor-id").value = record ? record.dhorid : "";
  document.getElementById("dhor-date").value = record ? record.date : todayString();
  document.getElementById("dhor-portion").value = source ? source.portionid : "";
  document.getElementById("dhor-mistakes").value = source ? source.mistakesNumber : "";
  document.getElementById("dhor-minutes").value = source ? source.readingMinutes : "";
  document.getElementById("dhor-comments").value = source ? source.comments : "";
  document.getElementById("dhor-status").value = source ? source.verifyStatus : "Pending";

  const nameInput = document.getElementById("dhor-name");
  const nameLabel = document.getElementById("dhor-name-label");
  const statusBox = document.getElementById("dhor-status-admin-box");
  const currentName = record ? (record.name || record.username || "") : getDefaultNameForForm(last);

  nameInput.value = currentName;

  if (state.portalType === "student") {
    nameInput.classList.add("hidden");
    nameLabel.classList.add("hidden");
    statusBox.classList.add("hidden");
  } else {
    nameInput.classList.remove("hidden");
    nameLabel.classList.remove("hidden");
    statusBox.classList.remove("hidden");
  }

  updateVerifyChoiceButtons();
  showScreen("dhor-form-screen");
}

async function getLastEntryForCurrentStudent() {
  const name = getDefaultNameForForm();
  const body = state.portalType === "admin" ? { name } : {};
  const result = await apiPost("/api/dhor/list", body, state.token);
  if (!result.success) return null;
  const records = result.records || [];
  return records.length ? records[0] : null;
}

function getDefaultNameForForm(last = null) {
  if (state.portalType === "student") return displayName(state.user) || DEFAULT_STUDENT_ID;
  return last ? (last.name || last.username || DEFAULT_STUDENT_ID) : DEFAULT_STUDENT_ID;
}

function setFormVerifyStatus(status) {
  document.getElementById("dhor-status").value = status;
  updateVerifyChoiceButtons();
}

function updateVerifyChoiceButtons() {
  const status = document.getElementById("dhor-status").value || "Pending";
  document.querySelectorAll(".verify-choice-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.status === status);
  });
}

async function saveDhorEntry() {
  const portionSelect = document.getElementById("dhor-portion");
  const option = portionSelect.options[portionSelect.selectedIndex];
  const record = {
    dhorid: document.getElementById("dhor-id").value.trim(),
    date: document.getElementById("dhor-date").value,
    name: document.getElementById("dhor-name").value.trim(),
    portionid: portionSelect.value,
    quarterjuzname: option ? option.dataset.name || option.textContent : "",
    mistakesNumber: Number(document.getElementById("dhor-mistakes").value || 0),
    readingMinutes: Number(document.getElementById("dhor-minutes").value || 0),
    comments: document.getElementById("dhor-comments").value.trim(),
    verifyStatus: document.getElementById("dhor-status").value || "Pending"
  };

  if (!record.date) return showFormMessage("Please select a date.");
  if (!record.portionid) return showFormMessage("Please select a portion.");
  if (state.portalType === "admin" && !record.name) return showFormMessage("Please enter the student name.");

  const button = document.getElementById("save-dhor-btn");
  button.disabled = true;
  button.innerText = "Saving...";
  const result = await apiPost("/api/dhor/save", record, state.token);
  button.disabled = false;
  button.innerText = "Save Dhor Entry";

  if (!result.success) return showFormMessage(result.error || "Could not save entry.");
  showFormMessage("Saved successfully.");
  await openDhorList();
}

function showFormMessage(message) {
  document.getElementById("dhor-form-message").innerText = message;
}

async function openDhorList() {
  document.getElementById("dhor-list-screen").classList.toggle("student-theme", state.portalType === "student");
  document.getElementById("dhor-list-screen").classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-list-title").innerText = state.portalType === "admin" ? "Dhor Progress" : "My Dhor Progress";
  document.getElementById("admin-filter-box").classList.toggle("hidden", state.portalType !== "admin");
  if (state.portalType === "admin" && !document.getElementById("admin-name-filter").value.trim()) {
    document.getElementById("admin-name-filter").value = DEFAULT_STUDENT_ID;
  }
  showScreen("dhor-list-screen");
  await loadDhorRecords();
}

async function loadDhorRecords() {
  const container = document.getElementById("dhor-record-list");
  container.innerHTML = `<p class="helper-text">Loading records...</p>`;
  const body = state.portalType === "admin"
    ? { name: document.getElementById("admin-name-filter").value.trim() }
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
  const verified = records.filter(r => r.verifyStatus === "Verified").length;
  const review = records.filter(r => r.verifyStatus === "Needs Review").length;
  document.getElementById("dhor-summary").innerHTML = `
    <div class="summary-card"><span class="summary-number">${total}</span><span>Entries</span></div>
    <div class="summary-card"><span class="summary-number">${verified}</span><span>👍 Verified</span></div>
    <div class="summary-card"><span class="summary-number">${review}</span><span>👎 Review</span></div>
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
    const verifyDateLine = record.verifyDate ? `<strong>Verify Date:</strong> ${escapeHtml(record.verifyDate)}<br>` : "";
    const adminVerify = state.portalType === "admin" ? `
      <button class="emoji-btn" onclick="setVerifyStatus('${escapeForAttribute(record.dhorid)}', 'Verified')">👍<br><span>Needs Verified</span></button>
      <button class="emoji-btn" onclick="setVerifyStatus('${escapeForAttribute(record.dhorid)}', 'Needs Review')">👎<br><span>Needs Review</span></button>
    ` : "";

    return `
      <div class="dhor-card">
        <div class="dhor-card-title">${escapeHtml(record.juzno ? record.juzno + " · " : "")}${escapeHtml(record.quarterjuzname || record.portionid)} · ${escapeHtml(record.date)}</div>
        <div class="dhor-meta">
          <strong>Name:</strong> ${escapeHtml(record.name || record.username)}<br>
          <strong>Mistakes:</strong> ${escapeHtml(record.mistakesNumber)} · <strong>Minutes:</strong> ${escapeHtml(record.readingMinutes)}<br>
          ${record.comments ? `<strong>Comments:</strong> ${escapeHtml(record.comments)}<br>` : ""}
          ${verifyDateLine}
          <span class="status-pill ${statusClass}">${statusEmoji(record.verifyStatus)} ${escapeHtml(record.verifyStatus || "Pending")}</span>
        </div>
        <div class="card-actions">
          <button onclick="editRecord('${escapeForAttribute(record.dhorid)}')">Edit</button>
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

function statusEmoji(status) {
  if (status === "Verified") return "👍";
  if (status === "Needs Review") return "👎";
  return "⏳";
}

function displayName(user) {
  return (user && (user.name || user.username || user.studentid || user.adminid)) || "";
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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeForAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
