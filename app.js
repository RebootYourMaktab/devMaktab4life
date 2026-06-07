const API_BASE = "https://ummedhorworker.naidu-hajira.workers.dev";

const DEFAULT_STUDENT_ID = "HIFDH1";

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("dhor_token") || "",
  user: null,
  currentStudent: null,
  portions: [],
  records: [],
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

  document.getElementById("portal-title").innerText = "Umme Hifdh Record";
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
    document.getElementById("portal-subtitle").innerText = `${result.admin.username} · ${result.admin.role || "ADMIN"}`;
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
  await prepareRecordScreen();
}

async function prepareRecordScreen() {
  if (state.portalType === "admin") {
    const result = await apiPost("/api/dhor/default-student", { studentid: DEFAULT_STUDENT_ID }, state.token);
    if (!result.success || !result.student) {
      alert(result.error || "Could not load default student HIFDH1.");
      return;
    }
    state.currentStudent = result.student;
  } else {
    state.currentStudent = {
      studentid: state.user.studentid,
      username: state.user.username
    };
  }

  await loadDhorRecords(false);
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

function openDhorForm() {
  const formScreen = document.getElementById("dhor-form-screen");
  formScreen.classList.toggle("student-theme", state.portalType === "student");
  formScreen.classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-form-title").innerText = "Umme Hifdh Record";
  document.getElementById("dhor-form-message").innerText = "";

  const latest = getLatestRecordForCurrentStudent();
  fillForm(latest);
  setPrefilledState(!!latest);
  chooseVerifyStatus("Pending");
  document.getElementById("admin-verification-box").classList.toggle("hidden", state.portalType !== "admin");
  showScreen("dhor-form-screen");
}

function fillForm(record) {
  document.getElementById("dhor-date").value = todayString();
  document.getElementById("dhor-studentid").value = state.currentStudent ? state.currentStudent.studentid || "" : "";
  document.getElementById("dhor-username-hidden").value = state.currentStudent ? state.currentStudent.username || "" : "";
  document.getElementById("dhor-display-name").value = state.currentStudent ? state.currentStudent.username || "" : "";

  document.getElementById("dhor-portion").value = record ? record.portionid || "" : "";
  document.getElementById("dhor-mistakes").value = record ? Number(record.mistakesNumber || 0) : "";
  document.getElementById("dhor-minutes").value = record ? Number(record.readingMinutes || 0) : "";
  document.getElementById("dhor-comments").value = record ? record.comments || "" : "";
}

function setPrefilledState(isPrefilled) {
  ["dhor-portion", "dhor-mistakes", "dhor-minutes", "dhor-comments"].forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle("prefilled-field", isPrefilled);
    el.oninput = () => el.classList.remove("prefilled-field");
    el.onchange = () => el.classList.remove("prefilled-field");
  });
}

function getLatestRecordForCurrentStudent() {
  if (!state.currentStudent) return null;
  const username = String(state.currentStudent.username || "").toLowerCase();
  const studentRecords = state.records.filter(r => String(r.username || "").toLowerCase() === username);
  return studentRecords[0] || null;
}

function chooseVerifyStatus(status) {
  state.selectedVerifyStatus = status || "Pending";
  document.getElementById("dhor-verify-status").value = state.selectedVerifyStatus;
  updateVerifyButtons();
}

function updateVerifyButtons() {
  const needs = document.getElementById("verify-needs-work");
  const tops = document.getElementById("verify-tops");
  if (!needs || !tops) return;

  needs.classList.toggle("selected", state.selectedVerifyStatus === "Needs Work");
  tops.classList.toggle("selected", state.selectedVerifyStatus === "Tops Alhamdullilah");
  needs.innerText = state.selectedVerifyStatus === "Needs Work" ? "👎" : "Needs Work";
  tops.innerText = state.selectedVerifyStatus === "Tops Alhamdullilah" ? "👍" : "Tops Alhamdullilah";
}

async function saveDhorEntry() {
  const portionSelect = document.getElementById("dhor-portion");
  const option = portionSelect.options[portionSelect.selectedIndex];
  const record = {
    date: document.getElementById("dhor-date").value,
    studentid: document.getElementById("dhor-studentid").value.trim(),
    username: document.getElementById("dhor-username-hidden").value.trim(),
    portionid: portionSelect.value,
    quarterjuzname: option ? option.dataset.name || option.textContent : "",
    mistakesNumber: Number(document.getElementById("dhor-mistakes").value || 0),
    readingMinutes: Number(document.getElementById("dhor-minutes").value || 0),
    comments: document.getElementById("dhor-comments").value.trim(),
    verifyStatus: state.portalType === "admin" ? state.selectedVerifyStatus : "Pending"
  };

  if (!record.date) return showFormMessage("Please select a date.");
  if (!record.username) return showFormMessage("Student name is missing.");
  if (!record.portionid) return showFormMessage("Please select a portion.");

  const button = document.getElementById("save-dhor-btn");
  button.disabled = true;
  button.innerText = "Saving...";
  const result = await apiPost("/api/dhor/save", record, state.token);
  button.disabled = false;
  button.innerText = "Save Dhor Entry";

  if (!result.success) return showFormMessage(result.error || "Could not save entry.");
  showFormMessage(`Saved successfully as ${result.dhorid || "new entry"}.`);
  await loadDhorRecords(false);
  setPrefilledState(false);
}

function showFormMessage(message) {
  document.getElementById("dhor-form-message").innerText = message;
}

async function openDhorList() {
  document.getElementById("dhor-list-screen").classList.toggle("student-theme", state.portalType === "student");
  document.getElementById("dhor-list-screen").classList.toggle("admin-theme", state.portalType === "admin");
  document.getElementById("dhor-list-title").innerText = state.portalType === "admin" ? "Dhor Progress" : "My Dhor Progress";
  showScreen("dhor-list-screen");
  await loadDhorRecords(true);
}

async function loadDhorRecords(render = true) {
  const body = state.portalType === "admin"
    ? { username: state.currentStudent ? state.currentStudent.username : "" }
    : {};
  const result = await apiPost("/api/dhor/list", body, state.token);
  if (!result.success) {
    if (render) document.getElementById("dhor-record-list").innerHTML = `<p class="error-message">${escapeHtml(result.error || "Could not load records.")}</p>`;
    return;
  }
  state.records = result.records || [];
  if (render) {
    renderSummary(state.records);
    renderDhorRecords(state.records);
  }
}

function renderSummary(records) {
  const total = records.length;
  const tops = records.filter(r => r.verifyStatus === "Tops Alhamdullilah").length;
  const needs = records.filter(r => r.verifyStatus === "Needs Work").length;
  document.getElementById("dhor-summary").innerHTML = `
    <div class="summary-card"><span class="summary-number">${total}</span><span>Entries</span></div>
    <div class="summary-card"><span class="summary-number">${tops}</span><span>Tops</span></div>
    <div class="summary-card"><span class="summary-number">${needs}</span><span>Needs Work</span></div>
  `;
}

function renderDhorRecords(records) {
  const container = document.getElementById("dhor-record-list");
  if (!records.length) {
    container.innerHTML = `<p class="helper-text">No Dhor progress has been recorded yet.</p>`;
    return;
  }

  container.innerHTML = records.map(record => {
    const statusIcon = record.verifyStatus === "Tops Alhamdullilah" ? "👍" : record.verifyStatus === "Needs Work" ? "👎" : "Pending";
    return `
      <div class="dhor-card">
        <div class="dhor-card-title">${escapeHtml(record.dhorid)} · ${escapeHtml(record.quarterjuzname || record.portionid)}</div>
        <div class="dhor-meta">
          <strong>Date:</strong> ${escapeHtml(record.date)}<br>
          <strong>Name:</strong> ${escapeHtml(record.username)}<br>
          <strong>Mistakes:</strong> ${escapeHtml(record.mistakesNumber)} · <strong>Minutes:</strong> ${escapeHtml(record.readingMinutes)}<br>
          ${record.comments ? `<strong>Comments:</strong> ${escapeHtml(record.comments)}<br>` : ""}
          <strong>Verification:</strong> ${escapeHtml(statusIcon)}${record.verifyDate ? ` · ${escapeHtml(record.verifyDate)}` : ""}${record.adminUserName ? ` · ${escapeHtml(record.adminUserName)}` : ""}
        </div>
      </div>
    `;
  }).join("");
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
