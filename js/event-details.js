// ==========================================================================
// event-details.js
// Powers event-details.html?id=EVENT_ID
// ==========================================================================

import { db, auth, COLLECTIONS } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { formatDate } from "./events.js";
import { checkExistingRegistration, registerForEvent, registrationErrorMessage } from "./registration.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let currentEvent = null;
let currentEventId = null;
let currentUser = null;

function renderEvent(event) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  document.title = `${event.title || "Event"} — Saraswati Events`;

  const poster = document.getElementById("details-poster");
  if (poster) {
    poster.src = event.posterURL || "https://picsum.photos/seed/no-poster/800/1000";
    poster.alt = `Poster for ${event.title || "event"}`;
  }

  set("details-category", event.category || "");
  set("details-title", event.title || "Untitled event");
  set("details-date", formatDate(event.date));
  set("details-time", event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : (event.startTime || ""));
  set("details-venue", event.venue || "—");
  set("details-department", event.department || "—");
  set("details-organizer", event.organizer || "—");
  set("details-deadline", event.registrationDeadline ? formatDate(event.registrationDeadline) : "—");

  const descEl = document.getElementById("details-description");
  if (descEl) descEl.textContent = event.description || "No description provided.";

  const seatsEl = document.getElementById("details-seats");
  const registered = event.registeredCount ?? 0;
  if (seatsEl) {
    seatsEl.textContent = typeof event.maxSeats === "number" ? `${registered} / ${event.maxSeats}` : `${registered} registered`;
  }
}

function setStatusMessage(message, variant) {
  const box = document.getElementById("registration-status");
  if (!box) return;
  box.textContent = message;
  box.className = `details-status-msg details-status-msg--${variant}`;
  box.hidden = false;
}

function setButtonState({ label, disabled, onClick }) {
  const btn = document.getElementById("register-btn");
  if (!btn) return;
  btn.textContent = label;
  btn.disabled = disabled;
  btn.onclick = onClick || null;
}

async function refreshRegistrationUi() {
  if (!currentEvent) return;

  const seatsFull =
    typeof currentEvent.maxSeats === "number" &&
    (currentEvent.registeredCount ?? 0) >= currentEvent.maxSeats;

  const deadlinePassed =
    currentEvent.registrationDeadline &&
    new Date(
      currentEvent.registrationDeadline.toDate
        ? currentEvent.registrationDeadline.toDate()
        : currentEvent.registrationDeadline
    ).getTime() < Date.now();

  // User is not logged in
  if (!currentUser) {
    setButtonState({
      label: "Login to Register",
      disabled: false,
      onClick: () => {
        window.location.href =
          `student/login.html?redirect=../event-details.html?id=${currentEventId}`;
      },
    });

    setStatusMessage("Please login to register.", "info");
    return;
  }

  // Get the user's role from Firestore
  let userRole = null;

  try {
    const userSnap = await getDoc(
      doc(db, COLLECTIONS.USERS, currentUser.uid)
    );

    if (userSnap.exists()) {
      const userData = userSnap.data();
      userRole = userData.role;

      console.log("===== ROLE DEBUG =====");
      console.log("Auth UID:", currentUser.uid);
      console.log("Firestore User:", userData);
      console.log("User Role:", userRole);
      console.log("=====================");
    }
  } catch (err) {
    console.error("Failed to load user profile:", err);

    setButtonState({
      label: "Unable to Register",
      disabled: true,
    });

    setStatusMessage(
      "Unable to verify your account. Please try again.",
      "error"
    );

    return;
  }

  // Admin account
  if (userRole === "admin") {
    setButtonState({
      label: "Admin Account",
      disabled: true,
    });

    setStatusMessage(
      "You are logged in as an administrator. Student registration is not available.",
      "info"
    );

    return;
  }

  // Only students can continue
  if (userRole !== "student") {
    setButtonState({
      label: "Login as Student",
      disabled: true,
    });

    setStatusMessage(
      "Please use a student account to register for events.",
      "warning"
    );

    return;
  }

  // Check whether this student has already registered
  try {
    const alreadyRegistered = await checkExistingRegistration(
      currentEventId,
      currentUser.uid
    );

    if (alreadyRegistered) {
      setButtonState({
        label: "You Are Registered ✓",
        disabled: true,
      });

      setStatusMessage(
        "You're all set — we'll see you there.",
        "success"
      );

      return;
    }
  } catch (err) {
    console.error("Failed to check registration:", err);

    setButtonState({
      label: "Unable to Check Registration",
      disabled: true,
    });

    setStatusMessage(
      "Unable to check your registration status. Please try again.",
      "error"
    );

    return;
  }

  // Deadline check
  if (deadlinePassed) {
    setButtonState({
      label: "Registration Closed",
      disabled: true,
    });

    setStatusMessage(
      "The registration deadline for this event has passed.",
      "warning"
    );

    return;
  }

  // Seat check
  if (seatsFull) {
    setButtonState({
      label: "Registration Full",
      disabled: true,
    });

    setStatusMessage(
      "This event has reached its registration limit.",
      "warning"
    );

    return;
  }

  // Student can register
  document
    .getElementById("registration-status")
    ?.setAttribute("hidden", "");

  setButtonState({
    label: "Register Now",
    disabled: false,
    onClick: handleRegisterClick,
  });
}

async function handleRegisterClick() {
  setButtonState({ label: "Registering…", disabled: true });
  const result = await registerForEvent(currentEventId, currentUser);

  if (result.ok) {
    currentEvent.registeredCount = (currentEvent.registeredCount ?? 0) + 1;
    document.getElementById("details-seats").textContent =
      typeof currentEvent.maxSeats === "number"
        ? `${currentEvent.registeredCount} / ${currentEvent.maxSeats}`
        : `${currentEvent.registeredCount} registered`;
    await refreshRegistrationUi();
  } else {
    setStatusMessage(registrationErrorMessage(result.error), "error");
    await refreshRegistrationUi();
  }
}

async function init() {
  currentEventId = new URLSearchParams(window.location.search).get("id");
  const wrapper = document.getElementById("details-wrapper");

  if (!currentEventId) {
    if (wrapper) wrapper.innerHTML = `<div class="state-panel"><p class="state-panel__title">No event specified.</p><p>Head back to <a href="events.html">Events</a> to pick one.</p></div>`;
    return;
  }

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.EVENTS, currentEventId));
    if (!snap.exists()) {
      if (wrapper) wrapper.innerHTML = `<div class="state-panel"><p class="state-panel__title">Event not found.</p><p>It may have been removed. Browse <a href="events.html">all events</a> instead.</p></div>`;
      return;
    }
    currentEvent = snap.data();
    renderEvent(currentEvent);
  } catch (err) {
    console.error("Failed to load event:", err);
    if (wrapper) wrapper.innerHTML = `<div class="state-panel"><p class="state-panel__title">Unable to load this event.</p><p>Please try again in a moment.</p></div>`;
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    await refreshRegistrationUi();
  });
}

document.addEventListener("DOMContentLoaded", init);