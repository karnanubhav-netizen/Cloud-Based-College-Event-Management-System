// ==========================================================================
// auth.js
// Handles: student signup, login, logout, auth state, and role checking.
// Admin accounts are created the same way (Firebase Auth + users/{uid} doc)
// but with role: "admin" — see README's "Admin account setup" section.
// This file has no page-specific DOM code; student/signup.js-style wiring
// lives directly in each page's small inline-module import (see signup.html).
// ==========================================================================

import { auth, db, COLLECTIONS, ROLES } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Validation ---------- */

export function validateSignupFields({ name, rollNo, email, password, department, semester, phone }) {
  const errors = {};

  if (!name || name.trim().length < 2) errors.name = "Enter your full name.";
  if (!rollNo || rollNo.trim().length < 2) errors.rollNo = "Enter your roll number.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!password || password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (!department) errors.department = "Select your department.";
  if (!semester) errors.semester = "Select your semester.";
  if (!phone || !/^[0-9]{10}$/.test(phone.replace(/\s|-/g, ""))) errors.phone = "Enter a valid 10-digit phone number.";

  return { valid: Object.keys(errors).length === 0, errors };
}

/* ---------- Student signup / login / logout ---------- */

export async function signUpStudent({ name, rollNo, email, password, department, semester, phone }) {
  const { valid, errors } = validateSignupFields({ name, rollNo, email, password, department, semester, phone });
  if (!valid) return { ok: false, errors };

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, COLLECTIONS.USERS, credential.user.uid), {
      name: name.trim(),
      email,
      rollNo: rollNo.trim(),
      department,
      semester,
      phone: phone.trim(),
      role: ROLES.STUDENT,
      createdAt: new Date(),
    });

    return { ok: true, user: credential.user };
  } catch (err) {
    return { ok: false, errors: { form: mapFirebaseAuthError(err) } };
  }
}

export async function loginWithEmail(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, user: credential.user };
  } catch (err) {
    return { ok: false, error: mapFirebaseAuthError(err) };
  }
}

export async function logoutUser() {
  await signOut(auth);
}

function mapFirebaseAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "An account with this email already exists.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  if (code.includes("weak-password")) return "Please choose a stronger password (min. 8 characters).";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "Invalid email or password.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a moment and try again.";
  if (code.includes("network-request-failed")) return "Unable to connect. Please check your connection and try again.";
  console.error("Firebase Auth error:", err);
  return "Something went wrong. Please try again.";
}

/* ---------- Role lookup + page guards ---------- */

/** Fetches the signed-in user's role from Firestore (users/{uid}.role). */
export async function getUserRole(uid) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snap.exists() ? snap.data().role : null;
}

/**
 * Guards a page so only a signed-in user with `requiredRole` can view it.
 * Anyone else is redirected to `redirectTo`. Call this at the top of every
 * student/* or admin/* page (except the login/signup pages themselves).
 */
export function requireRole(requiredRole, redirectTo) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = redirectTo;
        return;
      }
      const role = await getUserRole(user.uid);
      if (role !== requiredRole) {
        window.location.href = redirectTo;
        return;
      }
      resolve(user);
    });
  });
}

export { onAuthStateChanged };

/* ---------- Page wiring (self-detects which form is present) ---------- */

function showFormError(formEl, message) {
  let banner = formEl.querySelector("[data-form-banner]");
  if (!banner) {
    banner = document.createElement("p");
    banner.dataset.formBanner = "true";
    banner.className = "form-banner form-banner--error";
    formEl.prepend(banner);
  }
  banner.textContent = message;
  banner.className = "form-banner form-banner--error";
}

function showFieldErrors(formEl, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    if (field === "form") {
      showFormError(formEl, message);
      return;
    }
    const errorEl = formEl.querySelector(`[data-error-for="${field}"]`);
    if (errorEl) errorEl.textContent = message;
  });
}

function clearFieldErrors(formEl) {
  formEl.querySelectorAll("[data-error-for]").forEach((el) => (el.textContent = ""));
  formEl.querySelector("[data-form-banner]")?.remove();
}

function initSignupForm() {
  const form = document.getElementById("signup-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const submitBtn = form.querySelector("[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";

    const fields = Object.fromEntries(new FormData(form).entries());
    const result = await signUpStudent(fields);

    if (result.ok) {
      window.location.href = "dashboard.html";
    } else {
      showFieldErrors(form, result.errors || { form: "Signup could not be completed." });
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });
}

function initLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const submitBtn = form.querySelector("[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in…";

    const { email, password } = Object.fromEntries(new FormData(form).entries());
    const result = await loginWithEmail(email, password);

    if (result.ok) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");

      if (redirect) {
        window.location.href = redirect;
      } else {
        window.location.href = "dashboard.html";
      }
    } else {
      showFormError(form, result.error);
      submitBtn.disabled = false;
      submitBtn.textContent = "Log In";
    }
  });
}

function initLogoutButtons() {
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await logoutUser();
      const isAdminArea = window.location.pathname.includes("/admin/");
      window.location.href = isAdminArea ? "login.html" : "login.html";
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSignupForm();
  initLoginForm();
  initLogoutButtons();
});