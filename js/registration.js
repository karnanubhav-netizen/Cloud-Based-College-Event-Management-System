// ==========================================================================
// registration.js
// Core registration logic — used by event-details.js now, and by
// student/my-events.html + dashboard.html in a later part.
//
// Data model note: a registration's document ID is deterministic —
// `${eventId}_${studentId}` — so "is this student already registered"
// is a single getDoc() instead of a query, and it doubles as the guard
// against duplicate registrations inside the transaction below.
//
// Seat counting: events/{eventId} carries a `registeredCount` number
// field, incremented inside the same transaction that creates the
// registration doc. Reading + checking + writing all happen inside one
// Firestore transaction, so two students racing for the last seat can't
// both succeed — Firestore retries the loser against fresh data.
// ==========================================================================

import { db, COLLECTIONS, EVENT_STATUS } from "./firebase-config.js";
import {
  doc,
  getDoc,
  runTransaction,
  query,
  where,
  getDocs,
  collection
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const REGISTRATION_ERRORS = {
  NOT_LOGGED_IN: "NOT_LOGGED_IN",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  EVENT_FULL: "EVENT_FULL",
  DEADLINE_PASSED: "DEADLINE_PASSED",
  UNKNOWN: "UNKNOWN",
};

function registrationDocId(eventId, studentId) {
  return `${eventId}_${studentId}`;
}

/** Cheap existence check for rendering button state (not the source of truth during registration itself). */
export async function checkExistingRegistration(eventId, studentId) {
  if (!eventId || !studentId) return false;

  const q = query(
    collection(db, COLLECTIONS.REGISTRATIONS),
    where("studentId", "==", studentId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.some(
    (docSnap) => docSnap.data().eventId === eventId
  );
}

/**
 * Registers a student for an event.
 * @param {string} eventId
 * @param {import("firebase/auth").User} user - Firebase Auth user (must be signed in)
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export async function registerForEvent(eventId, user) {
  if (!user) return { ok: false, error: REGISTRATION_ERRORS.NOT_LOGGED_IN };

  // Student profile is read once, outside the transaction — it isn't part
  // of the seat-counting race, only the data we copy onto the registration.
  let profile = {};
  try {
    const profileSnap = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
    profile = profileSnap.exists() ? profileSnap.data() : {};
  } catch (err) {
    console.error("Failed to load student profile:", err);
    return { ok: false, error: REGISTRATION_ERRORS.UNKNOWN };
  }

  const eventRef = doc(db, COLLECTIONS.EVENTS, eventId);
  const registrationRef = doc(db, COLLECTIONS.REGISTRATIONS, registrationDocId(eventId, user.uid));

  try {
    await runTransaction(db, async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists()) throw new Error(REGISTRATION_ERRORS.EVENT_NOT_FOUND);

      const existingReg = await tx.get(registrationRef);
      if (existingReg.exists()) throw new Error(REGISTRATION_ERRORS.ALREADY_REGISTERED);

      const event = eventSnap.data();

      if (event.registrationDeadline) {
        const deadline = event.registrationDeadline.toDate
          ? event.registrationDeadline.toDate()
          : new Date(event.registrationDeadline);
        if (deadline.getTime() < Date.now()) throw new Error(REGISTRATION_ERRORS.DEADLINE_PASSED);
      }

      const registeredCount = event.registeredCount ?? 0;
      if (typeof event.maxSeats === "number" && registeredCount >= event.maxSeats) {
        throw new Error(REGISTRATION_ERRORS.EVENT_FULL);
      }

      tx.set(registrationRef, {
        eventId,
        studentId: user.uid,
        studentName: profile.name || user.displayName || "",
        rollNo: profile.rollNo || "",
        department: profile.department || "",
        semester: profile.semester || "",
        email: profile.email || user.email || "",
        registeredAt: new Date(),
        status: "confirmed",
      });

      tx.update(eventRef, { registeredCount: registeredCount + 1 });
    });

    return { ok: true };
  } catch (err) {
    const knownError = Object.values(REGISTRATION_ERRORS).includes(err.message) ? err.message : REGISTRATION_ERRORS.UNKNOWN;
    if (knownError === REGISTRATION_ERRORS.UNKNOWN) console.error("Registration failed:", err);
    return { ok: false, error: knownError };
  }
}

/** All registrations belonging to one student — used by my-events.html and the student dashboard. */
export async function fetchStudentRegistrations(studentId) {
  if (!studentId) return [];

  const q = query(
    collection(db, COLLECTIONS.REGISTRATIONS),
    where("studentId", "==", studentId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => ({
      id: d.id,
      ...d.data()
    }))
    .sort((a, b) => {
      const dateA = a.registeredAt?.toDate
        ? a.registeredAt.toDate()
        : new Date(a.registeredAt || 0);

      const dateB = b.registeredAt?.toDate
        ? b.registeredAt.toDate()
        : new Date(b.registeredAt || 0);

      return dateB - dateA;
    });
}

export function registrationErrorMessage(errorCode) {
  switch (errorCode) {
    case REGISTRATION_ERRORS.ALREADY_REGISTERED:
      return "You are already registered for this event.";
    case REGISTRATION_ERRORS.EVENT_FULL:
      return "This event has reached its registration limit.";
    case REGISTRATION_ERRORS.DEADLINE_PASSED:
      return "The registration deadline for this event has passed.";
    case REGISTRATION_ERRORS.EVENT_NOT_FOUND:
      return "This event could not be found.";
    case REGISTRATION_ERRORS.NOT_LOGGED_IN:
      return "Please log in to register.";
    default:
      return "Registration could not be completed. Please try again.";
  }
}