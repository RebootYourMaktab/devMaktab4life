export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") return corsResponse();
      if (url.pathname === "/") return json({ success: true, service: "ummedhor-worker", version: "1.0" });

      if (url.pathname === "/api/check-student") return checkStudent(request, env);
      if (url.pathname === "/api/setup-pin") return setupStudentPin(request, env);
      if (url.pathname === "/api/login") return studentLogin(request, env);

      if (url.pathname === "/api/admin/check-admin") return checkAdmin(request, env);
      if (url.pathname === "/api/admin/setup-pin") return setupAdminPin(request, env);
      if (url.pathname === "/api/admin/login") return adminLogin(request, env);

      if (url.pathname === "/api/dhor/portions") return listDhorPortions(request, env);
      if (url.pathname === "/api/dhor/list") return listDhorProgress(request, env);
      if (url.pathname === "/api/dhor/save") return saveDhorProgress(request, env);
      if (url.pathname === "/api/dhor/verify") return verifyDhorProgress(request, env);

      return json({ success: false, error: "Not found" }, 404);
    } catch (err) {
      return json({ success: false, error: "Worker error", detail: err && err.message ? err.message : String(err) }, 500);
    }
  }
};

async function checkStudent(request, env) {
  const body = await request.json();
  const uniqueid = String(body.uniqueid || "").trim();
  if (!uniqueid) return json({ success: false, error: "Missing uniqueid" }, 400);

  const result = await callAppsScript(env, { action: "getStudentByUniqueId", uniqueid });
  if (!result.student) return json({ success: false, error: "Invalid student link" }, 404);
  if (result.student.active !== true) return json({ success: false, error: "Account disabled" }, 403);

  return json({
    success: true,
    student: {
      studentid: result.student.studentid,
      username: result.student.username,
      classgroup: result.student.classgroup,
      pinsetup: result.student.pinsetup === true
    }
  });
}

async function setupStudentPin(request, env) {
  const body = await request.json();
  const uniqueid = String(body.uniqueid || "").trim();
  const pin = String(body.pin || "").trim();
  if (!uniqueid) return json({ success: false, error: "Missing uniqueid" }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "PIN must be 4 digits" }, 400);

  const pinhash = await hashPin(pin, env.PIN_SECRET || "");
  return json(await callAppsScript(env, { action: "setStudentPin", data: { uniqueid, pinhash } }));
}

async function studentLogin(request, env) {
  const body = await request.json();
  const uniqueid = String(body.uniqueid || "").trim();
  const pin = String(body.pin || "").trim();
  if (!uniqueid) return json({ success: false, error: "Missing uniqueid" }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "PIN must be 4 digits" }, 400);

  const result = await callAppsScript(env, { action: "getStudentForLogin", uniqueid });
  const student = result.student;
  if (!student) return json({ success: false, error: "Invalid login link" }, 404);
  if (student.active !== true) return json({ success: false, error: "Account disabled" }, 403);
  if (student.pinsetup !== true) return json({ success: false, error: "PIN not set up yet" }, 403);

  const enteredHash = await hashPin(pin, env.PIN_SECRET || "");
  if (enteredHash !== student.pinhash) return json({ success: false, error: "Incorrect PIN" }, 401);

  const token = await createSessionToken({
    type: "student",
    studentid: student.studentid,
    username: student.username,
    classgroup: student.classgroup
  }, env);

  return json({ success: true, token, student: { studentid: student.studentid, username: student.username, classgroup: student.classgroup } });
}

async function checkAdmin(request, env) {
  const body = await request.json();
  const uniqueid = String(body.uniqueid || "").trim();
  if (!uniqueid) return json({ success: false, error: "Missing uniqueid" }, 400);

  const result = await callAppsScript(env, { action: "getAdminByUniqueId", uniqueid });
  if (!result.admin) return json({ success: false, error: "Invalid admin link" }, 404);
  if (result.admin.active !== true) return json({ success: false, error: "Admin account disabled" }, 403);

  return json({
    success: true,
    admin: {
      adminid: result.admin.adminid,
      username: result.admin.username,
      uniqueid: result.admin.uniqueid,
      role: result.admin.role,
      assignedgroup: result.admin.assignedgroup,
      pinsetup: result.admin.pinsetup === true
    }
  });
}

async function setupAdminPin(request, env) {
  const body = await request.json();
  const uniqueid = String(body.uniqueid || "").trim();
  const pin = String(body.pin || "").trim();
  if (!uniqueid) return json({ success: false, error: "Missing uniqueid" }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "PIN must be 4 digits" }, 400);

  const pinhash = await hashPin(pin, env.PIN_SECRET || "");
  return json(await callAppsScript(env, { action: "setAdminPin", data: { uniqueid, pinhash } }));
}

async function adminLogin(request, env) {
  const body = await request.json();
  const uniqueid = String(body.uniqueid || "").trim();
  const pin = String(body.pin || "").trim();
  if (!uniqueid) return json({ success: false, error: "Missing uniqueid" }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "PIN must be 4 digits" }, 400);

  const result = await callAppsScript(env, { action: "getAdminByUniqueId", uniqueid });
  const admin = result.admin;
  if (!admin) return json({ success: false, error: "Invalid admin link" }, 404);
  if (admin.active !== true) return json({ success: false, error: "Account disabled" }, 403);
  if (admin.pinsetup !== true) return json({ success: false, error: "Admin PIN not set up yet" }, 403);

  const enteredHash = await hashPin(pin, env.PIN_SECRET || "");
  if (enteredHash !== admin.pinhash) return json({ success: false, error: "Incorrect PIN" }, 401);

  const token = await createSessionToken({
    type: "admin",
    adminid: admin.adminid,
    username: admin.username,
    role: admin.role,
    assignedgroup: admin.assignedgroup
  }, env);

  return json({ success: true, token, admin: { adminid: admin.adminid, username: admin.username, role: admin.role, assignedgroup: admin.assignedgroup } });
}

async function listDhorPortions(request, env) {
  const authUser = await requireAuth(request, env);
  if (!authUser.ok) return authUser.response;
  return json(await callAppsScript(env, { action: "listDhorPortions" }));
}

async function listDhorProgress(request, env) {
  const authUser = await requireAuth(request, env);
  if (!authUser.ok) return authUser.response;
  const body = await request.json().catch(() => ({}));

  const data = authUser.user.type === "student"
    ? { scope: "mine", username: authUser.user.username }
    : { scope: "all", username: String(body.username || "").trim() };

  const result = await callAppsScript(env, { action: "listDhorProgress", data });
  return json(result);
}

async function saveDhorProgress(request, env) {
  const authUser = await requireAuth(request, env);
  if (!authUser.ok) return authUser.response;
  const body = await request.json();

  const record = {
    dhorid: String(body.dhorid || "").trim(),
    date: String(body.date || "").trim(),
    portionid: String(body.portionid || "").trim(),
    quarterjuzname: String(body.quarterjuzname || "").trim(),
    mistakesNumber: Number(body.mistakesNumber || 0),
    readingMinutes: Number(body.readingMinutes || 0),
    comments: String(body.comments || "").trim(),
    username: authUser.user.type === "student" ? authUser.user.username : String(body.username || "").trim(),
    verifyStatus: normaliseVerifyStatus(String(body.verifyStatus || "Pending")),
    verifyDate: String(body.verifyDate || "").trim()
  };

  if (authUser.user.type === "student" && record.verifyStatus === "Tops Alhamdullilah") {
    record.verifyStatus = "Pending";
  }

  if (!record.date) return json({ success: false, error: "Date is required" }, 400);
  if (!record.portionid) return json({ success: false, error: "Portion is required" }, 400);
  if (!record.username) return json({ success: false, error: "Name is required" }, 400);

  return json(await callAppsScript(env, { action: "saveDhorProgress", data: record }));
}

async function verifyDhorProgress(request, env) {
  const authUser = await requireAdmin(request, env);
  if (!authUser.ok) return authUser.response;
  const body = await request.json();
  const data = {
    dhorid: String(body.dhorid || "").trim(),
    verifyStatus: normaliseVerifyStatus(String(body.verifyStatus || "Pending"))
  };
  return json(await callAppsScript(env, { action: "setDhorVerifyStatus", data }));
}

function normaliseVerifyStatus(status) {
  const text = String(status || "Pending").trim();
  const lower = text.toLowerCase();
  if (text === "Verified" || text === "Needs Verified" || text === "Tops" || lower === "tops alhamdullilah") return "Tops Alhamdullilah";
  if (lower === "needs review" || lower === "needs works" || lower === "needs work") return "Needs Review";
  return text || "Pending";
}

async function requireAuth(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  return { ok: true, user };
}

async function requireAdmin(request, env) {
  const user = await getAuthUser(request, env);
  if (!user || user.type !== "admin") return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  return { ok: true, user };
}

async function getAuthUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return verifySessionToken(auth.replace("Bearer ", "").trim(), env);
}

async function hashPin(pin, secret) {
  const data = new TextEncoder().encode(pin + secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function createSessionToken(payload, env) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 7 * 24 * 60 * 60 };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`;
  const signature = await hmacSha256(unsigned, env.SESSION_SECRET || env.PIN_SECRET || "");
  return `${unsigned}.${signature}`;
}

async function verifySessionToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = await hmacSha256(unsigned, env.SESSION_SECRET || env.PIN_SECRET || "");
  if (expected !== parts[2]) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch (err) {
    return null;
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function hmacSha256(text, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return base64UrlEncodeBytes(new Uint8Array(sig));
}

function base64UrlEncode(text) {
  return base64UrlEncodeBytes(new TextEncoder().encode(text));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  text = text.replace(/-/g, "+").replace(/_/g, "/");
  while (text.length % 4) text += "=";
  const binary = atob(text);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function callAppsScript(env, payload) {
  if (!env.APPS_SCRIPT_URL) throw new Error("Missing APPS_SCRIPT_URL environment variable");
  const response = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Apps Script returned non-JSON response. HTTP ${response.status}. First 200 chars: ${text.slice(0, 200)}`);
  }
  if (!response.ok) throw new Error(`Apps Script HTTP error ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function corsResponse() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}
