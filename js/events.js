// ==========================================================================
// events.js
// Fetches + renders events from Firestore. Self-detects which container(s)
// are present on the current page, so the same file works for:
//   - index.html      (#upcoming-events-grid, limited preview)
//   - events.html     (#events-grid, full listing + search/filters)
// No events are ever hardcoded — every card comes from Firestore.
// ==========================================================================

import { db, COLLECTIONS, EVENT_STATUS } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Helpers ---------- */

export function formatDate(dateValue) {
  if (!dateValue) return "";
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function renderEventCard(event) {
  const poster = event.posterURL || "https://picsum.photos/seed/no-poster/500/375";
  const registered = event.registeredCount ?? 0;

  return `
    <article class="event-card">
      <div class="event-card__media">
        <img src="${poster}" alt="Poster for ${escapeHtml(event.title)}" />
      </div>
      <div class="event-card__body">
        <span class="event-card__category">${escapeHtml(event.category || "")}</span>
        <h3 class="event-card__title">${escapeHtml(event.title || "Untitled event")}</h3>
        <div class="event-card__meta">
          <span>${formatDate(event.date)}${event.startTime ? " · " + event.startTime : ""}</span>
          <span>${escapeHtml(event.venue || "")}</span>
        </div>
        <div class="event-card__footer">
          <span class="type-meta">${registered} registered</span>
          <a href="event-details.html?id=${event.id}" class="btn btn--ghost">View Details</a>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSkeletonCards(container, count) {
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <article class="event-card">
        <div class="event-card__media skeleton"></div>
        <div class="event-card__body">
          <div class="skeleton" style="height:12px;width:40%;margin-bottom:8px;"></div>
          <div class="skeleton" style="height:20px;width:80%;margin-bottom:8px;"></div>
          <div class="skeleton" style="height:14px;width:60%;"></div>
        </div>
      </article>`
    )
    .join("");
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
  container.innerHTML = `
    <div class="state-panel" style="grid-column: 1 / -1;">
      <p class="state-panel__title">Something went wrong</p>
      <p>${message}</p>
    </div>
  `;
}

/* ---------- Data access ---------- */

async function fetchEvents({
  status,
  category,
  department,
  searchTerm,
  sortAsc = true,
  limitCount
} = {}) {

  try {
    const clauses = [];

    // Only request events the user is allowed to see.
    if (status) {
      clauses.push(where("status", "==", status));
    }

    const q = query(
      collection(db, COLLECTIONS.EVENTS),
      ...clauses
    );

    const snapshot = await getDocs(q);

    let events = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    // Category filter
    if (category && category !== "all") {
      events = events.filter(
        (event) => event.category === category
      );
    }

    // Department filter
    if (department && department !== "all") {
      events = events.filter(
        (event) => event.department === department
      );
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.trim().toLowerCase();

      events = events.filter((event) =>
        [
          event.title,
          event.venue,
          event.department,
          event.category
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }

    // Sort by date in JavaScript
    events.sort((a, b) => {
      const dateA = a.date?.toDate
        ? a.date.toDate()
        : new Date(a.date || 0);

      const dateB = b.date?.toDate
        ? b.date.toDate()
        : new Date(b.date || 0);

      return sortAsc
        ? dateA - dateB
        : dateB - dateA;
    });

    // Limit AFTER filtering/sorting
    if (limitCount) {
      events = events.slice(0, limitCount);
    }

    return events;

  } catch (error) {
    console.error("Failed to fetch events:", error);
    throw error;
  }
}

/* ---------- Homepage preview (limited) ---------- */

async function initHomepagePreview() {
  const container = document.getElementById("upcoming-events-grid");
  if (!container) return;

  renderSkeletonCards(container, 3);
  try {
    const events = await fetchEvents({ status: EVENT_STATUS.UPCOMING, limitCount: 3 });
    if (events.length === 0) {
      renderEmptyState(container, "No upcoming events yet.", "Check back soon for new experiences.");
      return;
    }
    container.innerHTML = events.map((e) => renderEventCard({ ...e, __isHome: true })).join("");
  } catch (err) {
    console.error("Failed to load upcoming events:", err);
    renderErrorState(container, "Unable to load events right now. Please try again.");
  }
}

/* ---------- Full listing page (events.html) ---------- */

let listingState = { searchTerm: "", category: "all", department: "all" };

async function runListingQuery() {
  const container = document.getElementById("events-grid");
  const countEl = document.getElementById("results-count");
  if (!container) return;

  renderSkeletonCards(container, 6);
  try {
    const events = await fetchEvents({
      status: EVENT_STATUS.UPCOMING,
      category: listingState.category,
      department: listingState.department,
      searchTerm: listingState.searchTerm,
    });

    if (countEl) countEl.textContent = `${events.length} event${events.length === 1 ? "" : "s"} found`;

    if (events.length === 0) {
      renderEmptyState(container, "No events match your filters.", "Try a different category, department, or search term.");
      return;
    }
    container.innerHTML = events.map((e) => renderEventCard(e)).join("");
  } catch (err) {
    console.error("Failed to load events:", err);
    renderErrorState(container, "Unable to load events right now. Please try again.");
  }
}

function initListingPage() {
  const container = document.getElementById("events-grid");
  if (!container) return;

  const searchInput = document.getElementById("event-search");
  const departmentSelect = document.getElementById("department-filter");
  const categoryChips = document.querySelectorAll("[data-category-chip]");

  // Preselect category from ?category= query param (linked from homepage cards)
  const urlCategory = new URLSearchParams(window.location.search).get("category");
  if (urlCategory) listingState.category = urlCategory;

  categoryChips.forEach((chip) => {
    if (chip.dataset.categoryChip === listingState.category) chip.setAttribute("aria-pressed", "true");
    chip.addEventListener("click", () => {
      categoryChips.forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      listingState.category = chip.dataset.categoryChip;
      runListingQuery();
    });
  });

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        listingState.searchTerm = e.target.value;
        runListingQuery();
      }, 250);
    });
  }

  if (departmentSelect) {
    departmentSelect.addEventListener("change", (e) => {
      listingState.department = e.target.value;
      runListingQuery();
    });
  }

  runListingQuery();
}

document.addEventListener("DOMContentLoaded", () => {
  initHomepagePreview();
  initListingPage();
});