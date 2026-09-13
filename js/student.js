// ==========================================================================
// student.js
// Powers student/dashboard.html, student/my-events.html, student/profile.html.
// Every page here is guarded by requireRole("student", ...) from auth.js,
// so a signed-out user or a signed-in admin is redirected before any
// Firestore read happens.
// ==========================================================================

import { db, COLLECTIONS, EVENT_STATUS } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireRole } from "./auth.js";
import { fetchStudentRegistrations } from "./registration.js";
import { formatDate, renderEventCard } from "./events.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchEventById(eventId) {
  const snap = await getDoc(doc(db, COLLECTIONS.EVENTS, eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ---------- Dashboard ---------- */

async function initDashboard() {
  const root = document.getElementById("dashboard-root");
  if (!root) return;

  const user = await requireRole("student", "login.html");
  const profileSnap = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};

  const welcomeEl = document.getElementById("welcome-message");
  if (welcomeEl) welcomeEl.textContent = `Welcome back, ${profile.name || "there"}`;

  let registrations = [];
  try {
    registrations = await fetchStudentRegistrations(user.uid);
  } catch (err) {
    console.error("Failed to load registrations:", err);
  }

  const registeredEvents = (await Promise.all(registrations.map((r) => fetchEventById(r.eventId)))).filter(Boolean);
  const myUpcoming = registeredEvents.filter((e) => e.status === EVENT_STATUS.UPCOMING);
  const myCompleted = registeredEvents.filter((e) => e.status === EVENT_STATUS.COMPLETED);

  setText("stat-registered", registrations.length);
  setText("stat-upcoming", myUpcoming.length);
  setText("stat-completed", myCompleted.length);

  // "My Registrations" — events this student is signed up for.
  renderEventList("dashboard-my-registrations", myUpcoming.slice(0, 3), "You haven't registered for any upcoming events yet.");
  // "Recent Events" — events this student attended.
  renderEventList("dashboard-recent", myCompleted.slice(0, 3), "Your attended events will show up here.");

  // "Upcoming Events" — a general browse of what's on, site-wide.
  await renderSiteUpcoming();
  // "Recommended Events" — upcoming events this student hasn't registered for yet.
  await renderRecommended(registeredEvents.map((e) => e.id));
}

async function renderSiteUpcoming() {
  const container = document.getElementById("dashboard-browse-upcoming");
  if (!container) return;

  try {
    const q = query(
      collection(db, COLLECTIONS.EVENTS),
      where("status", "==", EVENT_STATUS.UPCOMING)
    );

    const snapshot = await getDocs(q);

    const events = snapshot.docs
      .map((d) => ({
        id: d.id,
        ...d.data()
      }))
      .sort((a, b) => {
        const dateA = a.date?.toDate
          ? a.date.toDate()
          : new Date(a.date || 0);

        const dateB = b.date?.toDate
          ? b.date.toDate()
          : new Date(b.date || 0);

        return dateA - dateB;
      })
      .slice(0, 3);

    renderEventList(
      "dashboard-browse-upcoming",
      events,
      "No upcoming events yet. Check back soon for new experiences."
    );

  } catch (err) {
    console.error("Failed to load upcoming events:", err);

    renderEventList(
      "dashboard-browse-upcoming",
      [],
      "Unable to load upcoming events right now."
    );
  }
}

async function renderRecommended(alreadyRegisteredIds) {
  const container = document.getElementById("dashboard-recommended");
  if (!container) return;

  try {
    const q = query(
      collection(db, COLLECTIONS.EVENTS),
      where("status", "==", EVENT_STATUS.UPCOMING)
    );

    const snapshot = await getDocs(q);

    const events = snapshot.docs
      .map((d) => ({
        id: d.id,
        ...d.data()
      }))
      .filter(
        (event) => !alreadyRegisteredIds.includes(event.id)
      )
      .sort((a, b) => {
        const dateA = a.date?.toDate
          ? a.date.toDate()
          : new Date(a.date || 0);

        const dateB = b.date?.toDate
          ? b.date.toDate()
          : new Date(b.date || 0);

        return dateA - dateB;
      })
      .slice(0, 3);

    renderEventList(
      "dashboard-recommended",
      events,
      "No recommendations yet — check back after more events are posted."
    );

  } catch (err) {
    console.error("Failed to load recommended events:", err);

    renderEventList(
      "dashboard-recommended",
      [],
      "Unable to load recommendations right now."
    );
  }
}

function renderEventList(containerId, events, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (events.length === 0) {
    container.innerHTML = `<div class="state-panel" style="grid-column:1/-1;"><p>${emptyMessage}</p></div>`;
    return;
  }
  container.innerHTML = events.map((e) => renderEventCard(e)).join("");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ---------- My Events ---------- */

async function initMyEvents() {
  const container = document.getElementById("my-events-list");
  if (!container) return;

  const user = await requireRole("student", "login.html");

  try {
    const registrations = await fetchStudentRegistrations(user.uid);
    if (registrations.length === 0) {
      container.innerHTML = `<div class="state-panel"><p class="state-panel__title">You haven't registered for any events yet.</p><p>Head to <a href="../events.html">Events</a> to find something to join.</p></div>`;
      return;
    }

    const rows = await Promise.all(
      registrations.map(async (reg) => {
        const event = await fetchEventById(reg.eventId);
        if (!event) return null;
        return { reg, event };
      })
    );

    container.innerHTML = rows
      .filter(Boolean)
      .map(
        ({ reg, event }) => `
        <article class="event-card">
          <div class="event-card__media">
            <img src="${event.posterURL || "https://picsum.photos/seed/no-poster/500/375"}" alt="Poster for ${escapeHtml(event.title)}" />
          </div>
          <div class="event-card__body">
            <span class="event-card__category">${escapeHtml(event.category || "")}</span>
            <h3 class="event-card__title">${escapeHtml(event.title)}</h3>
            <div class="event-card__meta">
              <span>${formatDate(event.date)}${event.startTime ? " · " + event.startTime : ""}</span>
              <span>${escapeHtml(event.venue || "")}</span>
            </div>
            <div class="event-card__footer">
              <span class="type-meta">${escapeHtml(event.status || "")}</span>
              <a href="../event-details.html?id=${event.id}" class="btn btn--ghost">View Details</a>
            </div>
          </div>
        </article>`
      )
      .join("");
  } catch (err) {
    console.error("Failed to load your events:", err);
    container.innerHTML = `<div class="state-panel"><p class="state-panel__title">Unable to load your events right now.</p><p>Please try again in a moment.</p></div>`;
  }
}

/* ---------- Profile ---------- */

async function initProfile() {
  const form = document.getElementById("profile-form");
  if (!form) return;

  const user = await requireRole("student", "login.html");
  const profileRef = doc(db, COLLECTIONS.USERS, user.uid);
  const snap = await getDoc(profileRef);
  const profile = snap.exists() ? snap.data() : {};

  form.querySelector("#profile-name").value = profile.name || "";
  form.querySelector("#profile-rollNo").value = profile.rollNo || "";
  form.querySelector("#profile-email").value = profile.email || user.email || "";
  form.querySelector("#profile-department").value = profile.department || "";
  form.querySelector("#profile-semester").value = profile.semester || "";
  form.querySelector("#profile-phone").value = profile.phone || "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const banner = document.getElementById("profile-status");
    const submitBtn = form.querySelector("[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";

    const phone = form.querySelector("#profile-phone").value.trim();
    if (!/^[0-9]{10}$/.test(phone.replace(/\s|-/g, ""))) {
      if (banner) {
        banner.textContent = "Enter a valid 10-digit phone number.";
        banner.className = "form-banner form-banner--error";
        banner.hidden = false;
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
      return;
    }

    try {
      // Name, department, semester and phone are editable.
      // Roll number and email stay fixed — they're the student's identifiers.
      await updateDoc(profileRef, {
        name: form.querySelector("#profile-name").value.trim(),
        department: form.querySelector("#profile-department").value,
        semester: form.querySelector("#profile-semester").value,
        phone,
      });
      if (banner) {
        banner.textContent = "Profile updated.";
        banner.className = "form-banner form-banner--success";
        banner.hidden = false;
      }
    } catch (err) {
      console.error("Failed to update profile:", err);
      if (banner) {
        banner.textContent = "Unable to save changes right now. Please try again.";
        banner.className = "form-banner form-banner--error";
        banner.hidden = false;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
  initMyEvents();
  initProfile();
});