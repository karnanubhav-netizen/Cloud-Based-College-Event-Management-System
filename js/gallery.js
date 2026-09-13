// ==========================================================================
// gallery.js
// Fetches + renders event galleries from Firestore. Self-detects containers:
//   - index.html   (#previous-events-grid, limited preview)
//   - gallery.html  (#gallery-grid, full listing)
//   - gallery.html?event=ID (#photo-grid, single gallery + lightbox)
//
// Data model assumption (documented for the Firestore setup step):
//   galleries/{eventId}  <- gallery doc ID is the same as its event's ID,
//   so gallery.html?event=EVENT_ID can fetch it directly with getDoc()
//   instead of a query. `photos` is stored as an array of image URLs.
// ==========================================================================

import { db, COLLECTIONS } from "./firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "";
  const d = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function renderGalleryCard(gallery, isDark) {
  const photoCount = Array.isArray(gallery.photos) ? gallery.photos.length : 0;
  return `
    <a href="${gallery.__isHome ? "gallery.html?" : "?"}event=${gallery.id}" class="gallery-card">
      <img src="${gallery.coverImage || "https://picsum.photos/seed/no-cover/500/500"}" alt="Cover photo for ${escapeHtml(gallery.eventName)}" />
      <span class="gallery-card__info">
        <span class="type-h3">${escapeHtml(gallery.eventName || "Untitled event")}</span>
        <span class="type-meta" style="color:${isDark ? "var(--color-gray)" : "inherit"}">${photoCount} photos</span>
      </span>
    </a>
  `;
}

function renderEmptyState(container, title, message) {
  container.innerHTML = `
    <div class="state-panel" style="grid-column: 1 / -1;">
      <p class="state-panel__title">${title}</p>
      <p>${message}</p>
    </div>
  `;
}

function renderErrorState(container, message) {
  container.innerHTML = `<div class="state-panel" style="grid-column: 1 / -1;"><p class="state-panel__title">Something went wrong</p><p>${message}</p></div>`;
}

/* ---------- Homepage preview ---------- */

async function initHomepagePreview() {
  const container = document.getElementById("previous-events-grid");
  if (!container) return;

  try {
    const q = query(collection(db, COLLECTIONS.GALLERIES), orderBy("createdAt", "desc"), limit(4));
    const snapshot = await getDocs(q);
    const galleries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (galleries.length === 0) {
      renderEmptyState(container, "Event memories will appear here after the event.", "Check back after the next event wraps up.");
      return;
    }
    container.innerHTML = galleries.map((g) => renderGalleryCard({ ...g, __isHome: true }, true)).join("");
  } catch (err) {
    console.error("Failed to load galleries:", err);
    renderErrorState(container, "Unable to load the gallery preview right now.");
  }
}

/* ---------- Full listing (gallery.html, no ?event=) ---------- */

async function initListingPage() {
  const container = document.getElementById("gallery-grid");
  if (!container) return;

  try {
    const q = query(collection(db, COLLECTIONS.GALLERIES), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const galleries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (galleries.length === 0) {
      renderEmptyState(container, "Event memories will appear here after the event.", "Check back after the next event wraps up.");
      return;
    }
    container.innerHTML = galleries.map((g) => renderGalleryCard(g, false)).join("");
  } catch (err) {
    console.error("Failed to load galleries:", err);
    renderErrorState(container, "Unable to load galleries right now. Please try again.");
  }
}

/* ---------- Single gallery + lightbox (gallery.html?event=ID) ---------- */

let photos = [];
let currentPhotoIndex = 0;

function openLightbox(index) {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-image");
  if (!lightbox || !img) return;
  currentPhotoIndex = index;
  img.src = photos[currentPhotoIndex];
  lightbox.classList.add("is-open");
  document.getElementById("lightbox-close")?.focus();
}

function closeLightbox() {
  document.getElementById("lightbox")?.classList.remove("is-open");
}

function showPhoto(step) {
  currentPhotoIndex = (currentPhotoIndex + step + photos.length) % photos.length;
  const img = document.getElementById("lightbox-image");
  if (img) img.src = photos[currentPhotoIndex];
}

function wireLightboxControls() {
  document.getElementById("lightbox-close")?.addEventListener("click", closeLightbox);
  document.getElementById("lightbox-prev")?.addEventListener("click", () => showPhoto(-1));
  document.getElementById("lightbox-next")?.addEventListener("click", () => showPhoto(1));
  document.getElementById("lightbox")?.addEventListener("click", (e) => {
    if (e.target.id === "lightbox") closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    const lightbox = document.getElementById("lightbox");
    if (!lightbox || !lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showPhoto(-1);
    if (e.key === "ArrowRight") showPhoto(1);
  });
}

async function initSingleGallery(eventId) {
  const heading = document.getElementById("gallery-title");
  const meta = document.getElementById("gallery-meta");
  const grid = document.getElementById("photo-grid");
  if (!grid) return;

  grid.innerHTML = `<div class="state-panel" style="grid-column: 1 / -1;"><p>Loading gallery...</p></div>`;

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.GALLERIES, eventId));
    if (!snap.exists()) {
      renderEmptyState(grid, "Gallery not found.", "This event's gallery may not be published yet.");
      return;
    }
    const gallery = snap.data();
    photos = Array.isArray(gallery.photos) ? gallery.photos : [];

    if (heading) heading.textContent = gallery.eventName || "Event Gallery";
    if (meta) meta.textContent = `${photos.length} photos · ${formatDate(gallery.createdAt)}`;

    if (photos.length === 0) {
      renderEmptyState(grid, "Event memories will appear here after the event.", "Photos haven't been uploaded for this event yet.");
      return;
    }

    grid.innerHTML = photos
      .map(
        (url, i) => `
        <button type="button" data-photo-index="${i}" aria-label="Open photo ${i + 1} of ${photos.length}">
          <img src="${url}" alt="Event photo ${i + 1}" loading="lazy" />
        </button>`
      )
      .join("");

    grid.querySelectorAll("[data-photo-index]").forEach((btn) => {
      btn.addEventListener("click", () => openLightbox(Number(btn.dataset.photoIndex)));
    });
  } catch (err) {
    console.error("Failed to load gallery:", err);
    renderErrorState(grid, "Unable to load this gallery right now. Please try again.");
  }
}

function toggleGalleryPageView(hasEventParam) {
  const listingView = document.getElementById("gallery-listing-view");
  const singleView = document.getElementById("gallery-single-view");
  if (!listingView || !singleView) return; // not on gallery.html
  listingView.style.display = hasEventParam ? "none" : "";
  singleView.style.display = hasEventParam ? "" : "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const eventId = new URLSearchParams(window.location.search).get("event");

  initHomepagePreview(); // no-op unless #previous-events-grid exists (index.html)
  toggleGalleryPageView(Boolean(eventId)); // no-op unless on gallery.html

  if (eventId) {
    wireLightboxControls();
    initSingleGallery(eventId);
  } else {
    initListingPage();
  }
});