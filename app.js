const API_BASE = "https://maktab4lifeworker.maktab4life.workers.dev";

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("maktab_token") || "",
  userType: localStorage.getItem("maktab_user_type") || "",
  user: null
};

/* =========================
   APP INIT
========================= */

window.addEventListener("load", initApp);

function initApp() {
  const path = window.location.pathname;
  const parts = path.split("/").filter(Boolean);

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

  document.getElementById("portal-title").innerText = "UmmAbbad Academy";
  document.getElementById("portal-subtitle").innerText =
    "Please open your personal login link.";
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(id);

  if (target) {
    target.classList.add("active");
  }
}

function setError(message) {
  document.getElementById("auth-error").innerText = message || "";
}

async function apiPost(path, body = {}, token = "") {
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  return response.json();
}

/* =========================
   AUTH
========================= */

async function checkStudent() {
  try {
    const result = await apiPost("/api/check-student", {
      uniqueid: state.uniqueid
    });

    if (!result.success) {
      setError(result.error || "Invalid student link");
      return;
    }

    state.user = result.student;

    document.getElementById("portal-title").innerText = "Student Portal";
    document.getElementById("portal-subtitle").innerText =
      `Welcome ${result.student.username}`;

    if (result.student.pinsetup === true) {
      document.getElementById("login-pin-box").classList.remove("hidden");
    } else {
      document.getElementById("setup-pin-box").classList.remove("hidden");
    }
  } catch (err) {
    setError("Unable to connect. Please try again.");
  }
}

async function checkAdmin() {
  try {
    const result = await apiPost("/api/admin/check-admin", {
      uniqueid: state.uniqueid
    });

    if (!result.success) {
      setError(result.error || "Invalid admin link");
      return;
    }

    state.user = result.admin;

    document.getElementById("portal-title").innerText = "Staff Portal";
    document.getElementById("portal-subtitle").innerText =
      `${result.admin.username} · ${result.admin.role}`;

    document.body.classList.add("admin-body");

    if (result.admin.pinsetup === true) {
      document.getElementById("login-pin-box").classList.remove("hidden");
    } else {
      document.getElementById("setup-pin-box").classList.remove("hidden");
    }
  } catch (err) {
    setError("Unable to connect. Please try again.");
  }
}

async function submitSetupPin() {
  const pin = document.getElementById("setup-pin").value.trim();

  if (!/^\d{4}$/.test(pin)) {
    setError("PIN must be 4 digits.");
    return;
  }

  const path = state.portalType === "admin"
    ? "/api/admin/setup-pin"
    : "/api/setup-pin";

  const result = await apiPost(path, {
    uniqueid: state.uniqueid,
    pin
  });

  if (!result.success) {
    setError(result.error || "Could not set PIN.");
    return;
  }

  document.getElementById("setup-pin-box").classList.add("hidden");
  document.getElementById("login-pin-box").classList.remove("hidden");
  setError("");
}

async function submitLogin() {
  const pin = document.getElementById("login-pin").value.trim();

  if (!/^\d{4}$/.test(pin)) {
    setError("PIN must be 4 digits.");
    return;
  }

  const path = state.portalType === "admin"
    ? "/api/admin/login"
    : "/api/login";

  const result = await apiPost(path, {
    uniqueid: state.uniqueid,
    pin
  });

  if (!result.success) {
    setError(result.error || "Login failed.");
    return;
  }

  state.token = result.token;
  state.userType = state.portalType;
  state.user = state.portalType === "admin" ? result.admin : result.student;

  localStorage.setItem("maktab_token", state.token);
  localStorage.setItem("maktab_user_type", state.userType);

  if (state.portalType === "admin") {
    document.getElementById("admin-welcome").innerText =
      `${result.admin.username} · ${result.admin.role}`;
    showScreen("admin-home");
  } else {
    document.getElementById("student-welcome").innerText =
      `${result.student.username} · ${result.student.classgroup}`;
    showScreen("student-home");
  }
}

function logout() {
  localStorage.removeItem("maktab_token");
  localStorage.removeItem("maktab_user_type");
  location.reload();
}

function goHome() {
  if (state.userType === "admin" || state.portalType === "admin") {
    showScreen("admin-home");
  } else {
    showScreen("student-home");
  }
}

function showPlaceholder(title) {
  document.getElementById("placeholder-title").innerText = title;
  showScreen("placeholder-screen");
}

function showAdminAcademics() {
  showScreen("admin-academics");
}

/* =========================
   STUDENT TASK VIEW
========================= */

let studentSubjectTaskGroups = {};
let currentStudentSubjectKey = "";

async function showStudentTasks() {
  setProgressScreensForStudent();
  showScreen("progress-subjects-screen");

  const title = document.getElementById("progress-subjects-title");
  const container = document.getElementById("progress-subjects-list");

  title.innerText = "My Task Progress";
  container.innerHTML = `<p class="helper-text">Loading tasks...</p>`;

  const result = await apiPost("/api/tasks/student", {
    subjectid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Failed to load tasks"}</p>`;
    return;
  }

  if (!result.tasks || result.tasks.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks assigned yet.</p>`;
    return;
  }

  studentSubjectTaskGroups = buildStudentSubjectTaskGroups(result.tasks);
  renderStudentSubjectProgress();
}

function setProgressScreensForStudent() {
  ["progress-subjects-screen", "progress-tasks-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("admin-theme");
    screen.classList.add("student-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  if (subjectBackButton) {
    subjectBackButton.setAttribute("onclick", "showScreen('student-home')");
  }

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  if (taskBackButton) {
    taskBackButton.innerText = "Save Changes →";
    taskBackButton.classList.add("save-return-btn");
    taskBackButton.setAttribute("onclick", "saveStudentTaskChangesAndReturn()");
  }
}

function setProgressScreensForAdmin() {
  ["progress-subjects-screen", "progress-tasks-screen", "progress-task-students-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  if (subjectBackButton) {
    subjectBackButton.setAttribute("onclick", "showScreen('progress-report')");
  }

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  if (taskBackButton) {
    taskBackButton.innerText = "BACK";
    taskBackButton.classList.remove("save-return-btn");
    taskBackButton.setAttribute("onclick", "showScreen('progress-subjects-screen')");
  }

  const taskStudentsBackButton = document.querySelector("#progress-task-students-screen .small-btn");
  if (taskStudentsBackButton) {
    taskStudentsBackButton.innerText = "Save Changes →";
    taskStudentsBackButton.classList.add("save-return-btn");
    taskStudentsBackButton.setAttribute("onclick", "saveProgressPendingChangesAndReturn()");
  }
}

function buildStudentSubjectTaskGroups(tasks) {
  const groups = {};

  [...tasks].sort(sortByTaskId).forEach(task => {
    const subjectName = task.subjectname || "Other";
    const subjectKey = task.subjectid || subjectName;

    if (!groups[subjectKey]) {
      groups[subjectKey] = {
        subjectid: task.subjectid || subjectKey,
        subjectname: subjectName,
        tasks: []
      };
    }

    groups[subjectKey].tasks.push(task);
  });

  return groups;
}

function renderStudentSubjectProgress() {
  const container = document.getElementById("progress-subjects-list");
  const subjects = Object.values(studentSubjectTaskGroups).sort((a, b) => {
    return String(a.subjectname || "").localeCompare(String(b.subjectname || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });

  if (subjects.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks assigned yet.</p>`;
    return;
  }

  container.innerHTML = subjects.map(subject => {
    const total = subject.tasks.length;
    const completed = subject.tasks.filter(task => isStatusOn(task.completestatus)).length;
    const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

    return `
      <button class="progress-list-button" onclick="openStudentSubjectTasks('${escapeForAttribute(subject.subjectid)}')">
        <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
        ${renderCompleteProgressBar(percentComplete)}
      </button>
    `;
  }).join("");
}

function openStudentSubjectTasks(subjectKey) {
  setProgressScreensForStudent();

  const subject = studentSubjectTaskGroups[subjectKey];

  if (!subject) {
    alert("Subject not found. Please reload your tasks.");
    return;
  }

  currentStudentSubjectKey = subjectKey;
  document.getElementById("progress-tasks-title").innerText = subject.subjectname;
  showScreen("progress-tasks-screen");
  renderStudentSubjectTaskList();
}

function renderStudentSubjectTaskList() {
  const container = document.getElementById("progress-tasks-list");
  const subject = studentSubjectTaskGroups[currentStudentSubjectKey];

  if (!subject || subject.tasks.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks found for this subject.</p>`;
    return;
  }

  const rows = [...subject.tasks].sort(sortByTaskId);

  container.innerHTML = rows.map(task => {
    const pending = progressPendingUpdates[task.studenttaskid] || {};

    const completeStatus = pending.completeStatus !== undefined
      ? pending.completeStatus
      : task.completestatus;

    const isComplete = isStatusOn(completeStatus);
    const isVerified = isStatusOn(task.verifystatus);

    return `
      <div class="student-status-row">
        <div class="student-status-name">${escapeHtml(task.taskname)}</div>

        <div class="status-action" onclick="toggleStudentSubjectTask('${task.studenttaskid}', ${isComplete ? "false" : "true"})">
          ${
            isComplete
              ? `<span class="status-tick status-tick-complete">✓</span>`
              : `To be<br>completed`
          }
        </div>

        <div class="status-action">
          ${
            isVerified
              ? `<span class="status-tick status-tick-verified">✓</span>`
              : `To be<br>verified`
          }
        </div>
      </div>
    `;
  }).join("");
}

function toggleStudentSubjectTask(studenttaskid, complete) {
  if (!progressPendingUpdates[studenttaskid]) {
    progressPendingUpdates[studenttaskid] = {
      studenttaskid
    };
  }

  progressPendingUpdates[studenttaskid].completeStatus = complete ? "YES" : "";

  Object.values(studentSubjectTaskGroups).forEach(subject => {
    subject.tasks.forEach(task => {
      if (String(task.studenttaskid) === String(studenttaskid)) {
        task.completestatus = complete ? "YES" : "";
      }
    });
  });

  renderStudentSubjectTaskList();
}

async function toggleStudentTask(studenttaskid, complete) {
  const result = await apiPost("/api/tasks/update-complete", {
    studenttaskid,
    complete
  }, state.token);

  if (!result.success) {
    alert(result.error || "Could not update task.");
    return;
  }

  showStudentTasks();
}

/* =========================
   SUBJECTS UI
========================= */

let allSubjects = [];
let pendingSubjects = [];
let selectedSubject = null;
let selectedSubjectDraftActive = null;

async function showSubjectsScreen() {
  showScreen("subjects-screen");

  pendingSubjects = [];
  selectedSubject = null;
  selectedSubjectDraftActive = null;

  document.getElementById("subject-add-message").innerText = "";
  document.getElementById("modify-subject-box").classList.add("hidden");

  renderSubjectAddRows();
  await loadSubjectsForModify();
}

function renderSubjectAddRows() {
  const container = document.getElementById("subject-add-list");
  const submitBtn = document.getElementById("submit-subjects-btn");

  let html = "";

  pendingSubjects.forEach((name, index) => {
    html += `
      <div class="pending-subject-chip">
        <span>${escapeHtml(name)}</span>
        <button onclick="removePendingSubject(${index})">Remove</button>
      </div>
    `;
  });

  if (pendingSubjects.length < 5) {
    html += `
      <div class="subject-add-row">
        <input
          id="new-subject-input"
          type="text"
          placeholder="add a new subject"
          onkeydown="handleSubjectInputKey(event)"
        />
        <button class="enter-btn" onclick="addPendingSubject()">↵</button>
      </div>
    `;
  }

  container.innerHTML = html;

  if (pendingSubjects.length > 0) {
    submitBtn.classList.remove("hidden");
  } else {
    submitBtn.classList.add("hidden");
  }
}

function handleSubjectInputKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    addPendingSubject();
  }
}

function addPendingSubject() {
  const input = document.getElementById("new-subject-input");
  const subjectName = input ? input.value.trim() : "";

  if (!subjectName) {
    alert("Enter a subject name.");
    return;
  }

  if (pendingSubjects.length >= 5) {
    alert("You can add up to 5 subjects at once.");
    return;
  }

  const normalizedNew = normalizeClientText(subjectName);

  const duplicatePending = pendingSubjects.some(
    name => normalizeClientText(name) === normalizedNew
  );

  if (duplicatePending) {
    alert("This subject is already in your pending list.");
    return;
  }

  const duplicateExisting = allSubjects.some(
    subject => normalizeClientText(subject.subjectname) === normalizedNew
  );

  if (duplicateExisting) {
    alert("This subject already exists.");
    return;
  }

  pendingSubjects.push(subjectName);
  renderSubjectAddRows();

  setTimeout(() => {
    const nextInput = document.getElementById("new-subject-input");
    if (nextInput) nextInput.focus();
  }, 50);
}

function removePendingSubject(index) {
  pendingSubjects.splice(index, 1);
  renderSubjectAddRows();
}

async function submitPendingSubjects() {
  if (pendingSubjects.length === 0) {
    return;
  }

  const added = [];
  const failed = [];

  for (const subjectName of pendingSubjects) {
    const result = await apiPost("/api/admin/subjects/create", {
      subjectName
    }, state.token);

    if (result.success) {
      added.push(result.subject.subjectname);
    } else {
      failed.push({
        subjectName,
        error: result.error || "Failed"
      });
    }
  }

  if (added.length > 0) {
    document.getElementById("subject-add-message").innerText =
      `${added.join(", ")} ${added.length === 1 ? "has" : "have"} been added.`;
  }

  if (failed.length > 0) {
    alert(
      "Some subjects were not added:\n" +
      failed.map(f => `${f.subjectName}: ${f.error}`).join("\n")
    );
  }

  pendingSubjects = [];
  renderSubjectAddRows();
  await loadSubjectsForModify();
}

async function loadSubjectsForModify() {
  const select = document.getElementById("modify-subject-select");

  select.innerHTML = `<option value="">Loading subjects...</option>`;

  const result = await apiPost("/api/admin/subjects/list", {}, state.token);

  if (!result.success) {
    select.innerHTML = `<option value="">Failed to load subjects</option>`;
    return;
  }

  allSubjects = result.subjects || [];

  select.innerHTML = `<option value="">Select subject...</option>`;

  allSubjects.forEach(subject => {
    const status = subject.active === true ? "ACTIVE" : "INACTIVE";

    const option = document.createElement("option");
    option.value = subject.subjectid;
    option.textContent = `${subject.subjectname} — ${status}`;

    select.appendChild(option);
  });
}

function selectSubjectToModify() {
  const subjectid = document.getElementById("modify-subject-select").value;

  selectedSubject = allSubjects.find(subject => subject.subjectid === subjectid);

  const box = document.getElementById("modify-subject-box");

  if (!selectedSubject) {
    box.classList.add("hidden");
    selectedSubjectDraftActive = null;
    return;
  }

  selectedSubjectDraftActive = selectedSubject.active === true;

  document.getElementById("modify-subject-name").value = selectedSubject.subjectname;

  renderSelectedSubjectStatus();

  box.classList.remove("hidden");
}

function renderSelectedSubjectStatus() {
  const statusDisplay = document.getElementById("selected-subject-status");
  const statusBtn = document.getElementById("toggle-subject-status-btn");

  if (!selectedSubject) {
    statusDisplay.innerText = "STATUS: -";
    statusBtn.innerText = "Change Status";
    return;
  }

  statusDisplay.innerText = selectedSubjectDraftActive
    ? "STATUS: ACTIVE"
    : "STATUS: INACTIVE";

  statusBtn.innerText = selectedSubjectDraftActive
    ? "Make Inactive"
    : "Make Active";
}

function toggleSubjectStatusLocal() {
  if (!selectedSubject) {
    alert("Select a subject first.");
    return;
  }

  selectedSubjectDraftActive = !selectedSubjectDraftActive;
  renderSelectedSubjectStatus();
}

async function saveSubjectChanges() {
  if (!selectedSubject) {
    alert("Select a subject first.");
    return;
  }

  const subjectName = document.getElementById("modify-subject-name").value.trim();

  if (!subjectName) {
    alert("Subject name cannot be empty.");
    return;
  }

  const result = await apiPost("/api/admin/subjects/update", {
    subjectid: selectedSubject.subjectid,
    subjectName,
    active: selectedSubjectDraftActive
  }, state.token);

  if (!result.success) {
    alert(result.error || "Could not update subject.");
    return;
  }

  alert("Subject changes saved.");

  await loadSubjectsForModify();

  document.getElementById("modify-subject-box").classList.add("hidden");
  selectedSubject = null;
  selectedSubjectDraftActive = null;
}

/* =========================
   TEACHER / ADMIN PROGRESS DRILLDOWN
========================= */

const progressState = {
  contextType: null,
  classgroup: "ALL",
  studentid: "ALL",
  subjectid: "ALL",
  subjectname: "",
  taskid: "ALL",
  taskname: ""
};

let progressPendingUpdates = {};
let currentProgressRows = [];

async function showProgressReport() {
  setProgressScreensForAdmin();
  showScreen("progress-report");
  await loadProgressSelectors();
}

async function loadProgressSelectors() {
  const result = await apiPost("/api/progress/task-detail", {
    studentid: "ALL",
    classgroup: "ALL",
    subjectid: "ALL",
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    alert(result.error || "Could not load progress data.");
    return;
  }

  const groupSelect = document.getElementById("progress-group-select");
  const studentSelect = document.getElementById("progress-student-select");

  const groups = [...new Set(result.students.map(s => s.classgroup))]
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  groupSelect.innerHTML = `<option value="">Select a Group...</option>`;

  groups.forEach(group => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    groupSelect.appendChild(option);
  });

  const studentsMap = {};

  result.students.forEach(row => {
    if (!studentsMap[row.studentid]) {
      studentsMap[row.studentid] = {
        studentid: row.studentid,
        username: row.username,
        classgroup: row.classgroup
      };
    }
  });

  const students = Object.values(studentsMap).sort((a, b) => {
    const groupCompare = String(a.classgroup).localeCompare(
      String(b.classgroup),
      undefined,
      { numeric: true }
    );

    if (groupCompare !== 0) return groupCompare;

    return String(a.username).localeCompare(String(b.username));
  });

  studentSelect.innerHTML = `<option value="">Select a Student...</option>`;

  let currentGroup = "";
  let optgroup = null;

  students.forEach(student => {
    if (student.classgroup !== currentGroup) {
      currentGroup = student.classgroup;
      optgroup = document.createElement("optgroup");
      optgroup.label = currentGroup;
      studentSelect.appendChild(optgroup);
    }

    const option = document.createElement("option");
    option.value = student.studentid;
    option.textContent = student.username;
    optgroup.appendChild(option);
  });
}

function openSelectedGroupProgress() {
  const group = document.getElementById("progress-group-select").value;

  if (!group) {
    alert("Select a group first.");
    return;
  }

  openProgressContext("group", group);
}

function openSelectedStudentProgress() {
  const studentid = document.getElementById("progress-student-select").value;

  if (!studentid) {
    alert("Select a student first.");
    return;
  }

  openProgressContext("student", studentid);
}

async function openProgressContext(type, value) {
  progressState.contextType = type;
  progressState.subjectid = "ALL";
  progressState.taskid = "ALL";
  progressPendingUpdates = {};
  currentProgressRows = [];

  if (type === "class") {
    progressState.classgroup = "ALL";
    progressState.studentid = "ALL";
    document.getElementById("progress-subjects-title").innerText = "Class Subjects";
    await loadProgressSubjects();
    return;
  }

  if (type === "group") {
    progressState.classgroup = value;
    progressState.studentid = "ALL";
    document.getElementById("progress-subjects-title").innerText = `${value} Subjects`;
    await loadProgressSubjects();
    return;
  }

  if (type === "student") {
    progressState.classgroup = "ALL";
    progressState.studentid = value;
    progressState.subjectid = "ALL";
    progressState.taskid = "ALL";

    const selectedOption = document.querySelector(
      `#progress-student-select option[value="${CSS.escape(value)}"]`
    );

    const name = selectedOption ? selectedOption.textContent : "Student";

    progressState.studentName = name;
    document.getElementById("progress-subjects-title").innerText = `${name}'s Subjects`;

    await loadProgressSubjects();
  }
}

async function loadProgressSubjects() {
  showScreen("progress-subjects-screen");

  const container = document.getElementById("progress-subjects-list");
  container.innerHTML = `<p class="helper-text">Loading subjects...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: progressState.classgroup,
    subjectid: "ALL",
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load subjects."}</p>`;
    return;
  }

  if (!result.subjects || result.subjects.length === 0) {
    container.innerHTML = `<p class="helper-text">No assigned subjects found.</p>`;
    return;
  }

  container.innerHTML = result.subjects.map(subject => `
    <button class="progress-list-button" onclick="openProgressSubject('${subject.subjectid}', '${escapeForAttribute(subject.subjectname)}')">
      <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
      ${renderProgressBars(subject.completedPercent, subject.verifiedPercent)}
    </button>
  `).join("");
}

async function openProgressSubject(subjectid, subjectname) {
  progressState.subjectid = subjectid;
  progressState.subjectname = subjectname;
  progressState.taskid = "ALL";

  if (progressState.contextType === "student") {
    document.getElementById("progress-task-students-title").innerText = subjectname;
    await loadIndividualStudentTaskList();
    return;
  }

  document.getElementById("progress-tasks-title").innerText = subjectname;

  await loadProgressTasks();
}

async function loadProgressTasks() {
  showScreen("progress-tasks-screen");

  const container = document.getElementById("progress-tasks-list");
  container.innerHTML = `<p class="helper-text">Loading tasks...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: progressState.classgroup,
    subjectid: progressState.subjectid,
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load tasks."}</p>`;
    return;
  }

  if (!result.tasks || result.tasks.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks found.</p>`;
    return;
  }

  const sortedTasks = [...result.tasks].sort(sortByTaskId);

  container.innerHTML = sortedTasks.map(task => `
    <button class="progress-list-button" onclick="openProgressTask('${task.taskid}', '${escapeForAttribute(task.taskname)}')">
      <span class="progress-list-title">${escapeHtml(task.taskname)}</span>
      ${renderProgressBars(task.completedPercent, task.verifiedPercent)}
    </button>
  `).join("");
}

async function openProgressTask(taskid, taskname) {
  progressState.taskid = taskid;
  progressState.taskname = taskname;

  const title = progressState.contextType === "group"
    ? `${taskname} ${progressState.classgroup}`
    : taskname;

  document.getElementById("progress-task-students-title").innerText = title;

  await loadProgressTaskStudents();
}

async function loadProgressTaskStudents() {
  showScreen("progress-task-students-screen");

  progressPendingUpdates = {};

  const container = document.getElementById("progress-task-students-list");
  container.innerHTML = `<p class="helper-text">Loading students...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: progressState.classgroup,
    subjectid: progressState.subjectid,
    taskid: progressState.taskid
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load students."}</p>`;
    return;
  }

  if (!result.students || result.students.length === 0) {
    container.innerHTML = `<p class="helper-text">No student tasks found.</p>`;
    return;
  }

  currentProgressRows = result.students;
  renderProgressTaskStudents(currentProgressRows);
}

function renderProgressTaskStudents(rows) {
  const container = document.getElementById("progress-task-students-list");

  const byGroup = {};

  rows.forEach(row => {
    if (!byGroup[row.classgroup]) {
      byGroup[row.classgroup] = [];
    }

    byGroup[row.classgroup].push(row);
  });

  const groups = Object.keys(byGroup).sort((a, b) => {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

  let html = "";

  groups.forEach((group, index) => {
    if (index > 0) {
      html += `<div class="group-separator-line" aria-hidden="true"></div>`;
    }

    byGroup[group].forEach(row => {
      const pending = progressPendingUpdates[row.studenttaskid] || {};

      const completeStatus = pending.completeStatus !== undefined
        ? pending.completeStatus
        : row.completestatus;

      const verifyStatus = pending.verifyStatus !== undefined
        ? pending.verifyStatus
        : row.verifystatus;

      const isComplete = !!completeStatus;
      const isVerified = !!verifyStatus;

      html += `
        <div class="student-status-row">
          <div class="student-status-name">${escapeHtml(row.username)}</div>

          <div class="status-action" onclick="toggleProgressPending('${row.studenttaskid}', 'completeStatus', ${isComplete ? "false" : "true"})">
            ${
              isComplete
                ? `<span class="status-tick status-tick-complete">✓</span>`
                : `To be<br>completed`
            }
          </div>

          <div class="status-action" onclick="toggleProgressPending('${row.studenttaskid}', 'verifyStatus', ${isVerified ? "false" : "true"})">
            ${
              isVerified
                ? `<span class="status-tick status-tick-verified">✓</span>`
                : `To be<br>verified`
            }
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

async function loadIndividualStudentTaskList() {
  showScreen("progress-task-students-screen");

  progressPendingUpdates = {};

  const container = document.getElementById("progress-task-students-list");
  container.innerHTML = `<p class="helper-text">Loading student tasks...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: "ALL",
    subjectid: progressState.subjectid || "ALL",
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load student tasks."}</p>`;
    return;
  }

  if (!result.students || result.students.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks assigned to this student.</p>`;
    return;
  }

  currentProgressRows = result.students;
  renderIndividualStudentTaskList(currentProgressRows);
}

function renderIndividualStudentTaskList(rows) {
  const container = document.getElementById("progress-task-students-list");

  const bySubject = {};

  rows.forEach(row => {
    if (!bySubject[row.subjectname]) {
      bySubject[row.subjectname] = [];
    }

    bySubject[row.subjectname].push(row);
  });

  let html = "";
  const subjectNames = Object.keys(bySubject).sort();

  subjectNames.forEach((subjectName, index) => {
    if (progressState.subjectid === "ALL") {
      if (index > 0) {
        html += `<div class="group-separator-line" aria-hidden="true"></div>`;
      }
      html += `<div class="subject-heading-thin">${escapeHtml(subjectName)}</div>`;
    }

    [...bySubject[subjectName]].sort(sortByTaskId).forEach(row => {
      const pending = progressPendingUpdates[row.studenttaskid] || {};

      const completeStatus = pending.completeStatus !== undefined
        ? pending.completeStatus
        : row.completestatus;

      const verifyStatus = pending.verifyStatus !== undefined
        ? pending.verifyStatus
        : row.verifystatus;

      const isComplete = !!completeStatus;
      const isVerified = !!verifyStatus;

      html += `
        <div class="student-status-row">
          <div class="student-status-name">${escapeHtml(row.taskname)}</div>

          <div class="status-action" onclick="toggleProgressPending('${row.studenttaskid}', 'completeStatus', ${isComplete ? "false" : "true"})">
            ${
              isComplete
                ? `<span class="status-tick status-tick-complete">✓</span>`
                : `To be<br>completed`
            }
          </div>

          <div class="status-action" onclick="toggleProgressPending('${row.studenttaskid}', 'verifyStatus', ${isVerified ? "false" : "true"})">
            ${
              isVerified
                ? `<span class="status-tick status-tick-verified">✓</span>`
                : `To be<br>verified`
            }
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

function toggleProgressPending(studenttaskid, field, value) {
  if (!progressPendingUpdates[studenttaskid]) {
    progressPendingUpdates[studenttaskid] = {
      studenttaskid
    };
  }

  progressPendingUpdates[studenttaskid][field] = value ? "YES" : "";

  if (progressState.contextType === "student") {
    renderIndividualStudentTaskList(currentProgressRows);
  } else {
    renderProgressTaskStudents(currentProgressRows);
  }
}

async function saveProgressPendingChanges(options = {}) {
  const shouldReload = options.reload !== false;
  const shouldAlert = options.alert !== false;

  const updates = Object.values(progressPendingUpdates);

  if (updates.length === 0) {
    if (shouldAlert) {
      alert("No changes to save.");
    }
    return false;
  }

  for (const update of updates) {
    if (update.completeStatus !== undefined) {
      const completeResult = await apiPost("/api/tasks/update-complete", {
        studenttaskid: update.studenttaskid,
        complete: update.completeStatus !== ""
      }, state.token);

      if (!completeResult.success) {
        alert(completeResult.error || "Could not save completion update.");
        return false;
      }
    }

    if (update.verifyStatus !== undefined) {
      const verifyResult = await apiPost("/api/admin/tasks/verify", {
        studenttaskid: update.studenttaskid,
        verified: update.verifyStatus !== ""
      }, state.token);

      if (!verifyResult.success) {
        alert(verifyResult.error || "Could not save verification update.");
        return false;
      }
    }
  }

  progressPendingUpdates = {};

  if (shouldAlert) {
    alert("Changes saved.");
  }

  if (shouldReload) {
    if (progressState.contextType === "student") {
      await loadIndividualStudentTaskList();
    } else {
      await loadProgressTaskStudents();
    }
  }

  return true;
}

async function saveProgressPendingChangesAndReturn() {
  const button = document.querySelector("#progress-task-students-screen .small-btn");
  const originalText = button ? button.innerText : "Save Changes →";

  if (button) {
    button.disabled = true;
    button.innerText = "Saving...";
  }

  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (button) {
    button.disabled = false;
    button.innerText = originalText;
  }

  if (!saved && Object.keys(progressPendingUpdates).length > 0) {
    return;
  }

  if (progressState.contextType === "student") {
    showScreen("progress-subjects-screen");
  } else {
    showScreen("progress-tasks-screen");
  }
}

async function saveStudentTaskChangesAndReturn() {
  const button = document.querySelector("#progress-tasks-screen .small-btn");
  const originalText = button ? button.innerText : "Save Changes →";

  if (button) {
    button.disabled = true;
    button.innerText = "Saving...";
  }

  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (button) {
    button.disabled = false;
    button.innerText = originalText;
  }

  if (!saved && Object.keys(progressPendingUpdates).length > 0) {
    return;
  }

  progressPendingUpdates = {};
  showStudentTasks();
}


/* =========================
   HELPERS
========================= */
function setAuthTheme(type) {
  const authScreen = document.getElementById("auth-screen");
  if (!authScreen) return;

  authScreen.classList.remove("student-theme", "admin-theme");
  document.body.classList.remove("student-body", "admin-body");

  if (type === "student") {
    authScreen.classList.add("student-theme");
    document.body.classList.add("student-body");
  }

  if (type === "admin") {
    authScreen.classList.add("admin-theme");
    document.body.classList.add("admin-body");
  }
}





function groupTasksBySubject(tasks) {
  const grouped = {};

  tasks.forEach(task => {
    const subjectName = task.subjectname || "Other";

    if (!grouped[subjectName]) {
      grouped[subjectName] = [];
    }

    grouped[subjectName].push(task);
  });

  Object.keys(grouped).forEach(subjectName => {
    grouped[subjectName].sort(sortByTaskId);
  });

  return grouped;
}

function sortByTaskId(a, b) {
  const aRaw = a.taskid || a.taskID || a.TaskID || "";
  const bRaw = b.taskid || b.taskID || b.TaskID || "";
  const aNum = Number(aRaw);
  const bNum = Number(bRaw);

  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }

  const idCompare = String(aRaw).localeCompare(String(bRaw), undefined, {
    numeric: true,
    sensitivity: "base"
  });

  if (idCompare !== 0) return idCompare;

  return String(a.taskname || "").localeCompare(String(b.taskname || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function isStatusOn(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return text === "yes" || text === "true" || text === "complete" || text === "verified" || text === "1";
}

function renderCompleteProgressBar(completedPercent) {
  const completeWidth = Math.max(0, Math.min(100, Number(completedPercent) || 0));

  return `
    <span class="progress-bars">
      <span class="progress-bar-row">
        <span class="progress-bar-label">Complete</span>
        <span class="progress-track">
          <span class="progress-fill progress-fill-complete" style="width:${completeWidth}%"></span>
        </span>
      </span>
    </span>
  `;
}

function renderProgressBars(completedPercent, verifiedPercent) {
  const completeWidth = Math.max(0, Math.min(100, Number(completedPercent) || 0));
  const verifiedWidth = Math.max(0, Math.min(100, Number(verifiedPercent) || 0));

  return `
    <span class="progress-bars">
      <span class="progress-bar-row">
        <span class="progress-bar-label">Complete</span>
        <span class="progress-track">
          <span class="progress-fill progress-fill-complete" style="width:${completeWidth}%"></span>
        </span>
      </span>

      <span class="progress-bar-row">
        <span class="progress-bar-label">Verified</span>
        <span class="progress-track">
          <span class="progress-fill progress-fill-verified" style="width:${verifiedWidth}%"></span>
        </span>
      </span>
    </span>
  `;
}

function renderTaskLinks(task) {
  const links = [];

  if (task.pdflink) {
    links.push(`<a href="${escapeHtml(task.pdflink)}" target="_blank">PDF</a>`);
  }

  if (task.audiolink) {
    links.push(`<a href="${escapeHtml(task.audiolink)}" target="_blank">Audio</a>`);
  }

  if (task.videolink) {
    links.push(`<a href="${escapeHtml(task.videolink)}" target="_blank">Video</a>`);
  }

  if (task.visuallink) {
    links.push(`<a href="${escapeHtml(task.visuallink)}" target="_blank">Visual</a>`);
  }

  if (links.length === 0) {
    return "";
  }

  return `
    <div class="task-meta" style="margin-top:10px;">
      Resources: ${links.join(" · ")}
    </div>
  `;
}

function normalizeClientText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function escapeForAttribute(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', "&quot;");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
