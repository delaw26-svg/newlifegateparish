import { getStore } from "@netlify/blobs";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const STATE_KEY = "church-state-v1";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const dataStore = () => getStore("rccg-new-life-gate-data");
const sessionStore = () => getStore("rccg-new-life-gate-sessions");

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}
function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(String(password), salt, 64).toString("hex")}`;
}
function verifyPassword(password, saved) {
  if (!saved) return false;
  const parts = String(saved).split(":");
  if (parts.length !== 2) return String(password) === String(saved); // migrate older records
  try {
    const a = scryptSync(String(password), parts[0], 64);
    const b = Buffer.from(parts[1], "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}
function defaultState() {
  const now = new Date().toISOString();
  return {
    services: [], finance: [], members: [], firstTimers: [], activity: [],
    users: [
      { id: "rccg-admin-default", name: "Church Administrator", username: "admin", password: "Law123@", role: "admin", createdAt: now },
      { id: "rccg-staff-default", name: "Church Activity Recorder", username: "staff", password: "Law123", role: "user", createdAt: now }
    ],
    settings: {
      churchName: "The Redeemed Christian Church Of God",
      branchName: "NEW Life Gate Parish, Eleko Inside, Off Eleko Beach Road, Eleko Ibeju Lekki Lagos State"
    }
  };
}
function normaliseState(value) {
  const base = defaultState(), x = value && typeof value === "object" ? value : {};
  const state = {
    services: Array.isArray(x.services) ? x.services : [],
    finance: Array.isArray(x.finance) ? x.finance : [],
    members: Array.isArray(x.members) ? x.members : [],
    firstTimers: Array.isArray(x.firstTimers) ? x.firstTimers : [],
    activity: Array.isArray(x.activity) ? x.activity : [],
    users: Array.isArray(x.users) ? x.users : base.users,
    settings: { ...base.settings, ...(x.settings && typeof x.settings === "object" ? x.settings : {}) }
  };
  if (!state.users.some(u => String(u.username).toLowerCase() === "admin")) state.users.unshift(base.users[0]);
  const admin = state.users.find(u => String(u.username).toLowerCase() === "admin");
  admin.role = "admin";
  // Preserve the requested initial administrator credentials on the server.
  admin.password = "Law123@";
  if (!state.users.some(u => String(u.username).toLowerCase() === "staff")) state.users.push(base.users[1]);
  return state;
}
function publicState(state) {
  // The current frontend needs its user records for admin-side user management.
  // Passwords are not rendered in the interface; remove them from responses.
  const clone = structuredClone(state);
  clone.users = clone.users.map(({ passwordHash: _hash, ...u }) => u);
  return clone;
}
async function readState() {
  const store = dataStore();
  const stored = await store.get(STATE_KEY, { type: "json" });
  if (stored) {
    const state = normaliseState(stored);
    if (stored._meta) state._meta = stored._meta;
    return { state, isNew: false };
  }
  const state = defaultState();
  await store.setJSON(STATE_KEY, state);
  return { state, isNew: true };
}
async function writeState(state) {
  const updatedAt = new Date().toISOString();
  await dataStore().setJSON(STATE_KEY, { ...normaliseState(state), _meta: { updatedAt } });
  return updatedAt;
}
async function sessionFromRequest(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const record = await sessionStore().get(token, { type: "json" });
  if (!record || !record.expiresAt || Date.parse(record.expiresAt) <= Date.now()) {
    if (record) await sessionStore().delete(token);
    return null;
  }
  return { token, ...record };
}
function publicUser(user) {
  const { password, passwordHash, ...safe } = user;
  return safe;
}
export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  }});
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";
  try {
    if (request.method === "GET" && action === "status") {
      return response(200, { ok: true, service: "RCCG Church Management shared storage", storage: "Netlify Blobs" });
    }
    if (request.method !== "POST") return response(405, { error: "Use POST for this action." });
    const body = await request.json().catch(() => ({}));

    if (action === "login") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const expectedRole = body.expectedRole === "admin" ? "admin" : "user";
      if (!username || !password) return response(400, { error: "Enter your username and password." });
      const loaded = await readState();
      const state = loaded.state;
      let user = state.users.find(u => String(u.username).toLowerCase() === username.toLowerCase());
      if (user && String(user.username).toLowerCase() === "admin") {
        if (password !== "Law123@") user = null;
      } else if (user) {
        if (!verifyPassword(password, user.passwordHash || user.password)) user = null;
      }
      if (!user) return response(401, { error: "Incorrect username or password." });
      if (expectedRole === "admin" && user.role !== "admin") return response(403, { error: "This portal is for the administrator only. Please use Staff Login." });
      if (expectedRole === "user" && user.role === "admin") return response(403, { error: "Administrators must use the separate Admin Login portal." });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      await sessionStore().setJSON(token, { userId: user.id, username: user.username, role: user.role, expiresAt });
      return response(200, { ok: true, token, expiresAt, isNew: loaded.isNew, updatedAt: state._meta?.updatedAt || "", user: publicUser(user), state: publicState(state) });
    }

    const session = await sessionFromRequest(request);
    if (!session) return response(401, { error: "Your session has expired. Please sign in again." });
    const loaded = await readState();
    const state = loaded.state;
    const sessionUser = state.users.find(u => u.id === session.userId && String(u.username).toLowerCase() === String(session.username).toLowerCase());
    if (!sessionUser || sessionUser.role !== session.role) return response(403, { error: "Your access has been removed. Please contact the church administrator." });

    if (action === "load") return response(200, { ok: true, state: publicState(state), updatedAt: state._meta?.updatedAt || "" });

    if (action === "sync") {
      if (!body.state || typeof body.state !== "object") return response(400, { error: "No church records were supplied." });
      const incoming = normaliseState(body.state);
      let next;
      if (sessionUser.role === "admin") {
        next = incoming;
        // Never let a browser change the initial administrator password or role.
        const existingAdmin = state.users.find(u => String(u.username).toLowerCase() === "admin");
        next.users = (Array.isArray(incoming.users) ? incoming.users : state.users).map(u => {
          if (String(u.username).toLowerCase() === "admin") return { ...u, id: existingAdmin.id, role: "admin", password: "Law123@" };
          return u;
        });
        if (!next.users.some(u => String(u.username).toLowerCase() === "admin")) next.users.unshift(existingAdmin);
      } else {
        next = {
          ...state,
          services: incoming.services, finance: incoming.finance, members: incoming.members,
          firstTimers: incoming.firstTimers, activity: incoming.activity
        };
      }
      const updatedAt = await writeState(next);
      return response(200, { ok: true, updatedAt });
    }

    if (action === "clear-records") {
      if (sessionUser.role !== "admin") return response(403, { error: "Administrator access required." });
      const updatedAt = await writeState({ ...state, services: [], finance: [], members: [], firstTimers: [], activity: [] });
      return response(200, { ok: true, updatedAt });
    }

    return response(400, { error: "Unknown action." });
  } catch (error) {
    console.error("RCCG church-data error:", error);
    return response(500, { error: "The shared storage service encountered an error. Confirm the site is deployed on Netlify and try again." });
  }
};
