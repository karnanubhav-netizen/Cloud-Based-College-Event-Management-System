import {
  auth,
  db,
  COLLECTIONS,
  ROLES,
  EVENT_STATUS,
} from "./firebase-config.js";
import { requireRole } from "./auth.js";
import { uploadImageToCloudinary } from "./cloudinary.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const page = document.body.dataset.page;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function setStatus(message, type = "success") {
  const status = document.getElementById("page-status");
  if (!status) return;
  status.textContent = message;
  status.className = `page-status page-status--${type}`;
  status.hidden = false;
}

async function fetchEvents() {
  console.log("===== FETCH EVENTS DEBUG =====");
  console.log("Auth UID:", auth.currentUser?.uid);

  try {
    console.log("Attempting to read events collection...");

    const snap = await getDocs(
      collection(db, COLLECTIONS.EVENTS)
    );

    console.log("Events read SUCCESS");
    console.log("Total events:", snap.size);

    const events = snap.docs
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
      });

    console.log("Events:", events);
    console.log("==============================");

    return events;

  } catch (error) {
    console.error("===== FETCH EVENTS FAILED =====");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Full error:", error);
    console.error("==============================");

    throw error;
  }
}

async function fetchUsers(role = null) {
  const snap = await getDocs(
    collection(db, COLLECTIONS.USERS)
  );

  let users = snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));

  if (role) {
    users = users.filter(
      (user) => user.role === role
    );
  }

  users.sort((a, b) => {
    const dateA = a.createdAt?.toDate
      ? a.createdAt.toDate()
      : new Date(a.createdAt || 0);

    const dateB = b.createdAt?.toDate
      ? b.createdAt.toDate()
      : new Date(b.createdAt || 0);

    return dateB - dateA;
  });

  return users;
}

async function fetchRegistrations(eventId) {
  console.log("===== REGISTRATION READ DEBUG =====");
  console.log("Event ID:", eventId);
  console.log("Current Auth UID:", auth.currentUser?.uid);

  try {
    const registrationsRef = collection(
      db,
      COLLECTIONS.REGISTRATIONS
    );

    console.log("Attempting to read registrations collection...");

    const snap = await getDocs(registrationsRef);

    console.log("Registration read SUCCESS");
    console.log("Total registrations:", snap.size);

    const registrations = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data()
      }))
      .filter((registration) => registration.eventId === eventId)
      .sort((a, b) => {
        const dateA = a.registeredAt?.toDate
          ? a.registeredAt.toDate()
          : new Date(a.registeredAt || 0);

        const dateB = b.registeredAt?.toDate
          ? b.registeredAt.toDate()
          : new Date(b.registeredAt || 0);

        return dateB - dateA;
      });

    console.log("Registrations for selected event:", registrations);
    console.log("===================================");

    return registrations;

  } catch (error) {
    console.error("===== REGISTRATION READ FAILED =====");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Full error:", error);
    console.error("====================================");

    throw error;
  }
}

async function fetchGallery(eventId) {
  const snap = await getDoc(doc(db, COLLECTIONS.GALLERIES, eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function makeEventCard(event) {
  return `
    <article class="panel event-management-card">
      <div class="event-management-card__media">
        <img src="${event.posterURL || "https://picsum.photos/seed/no-poster/500/380"}" alt="Poster for ${escapeHtml(event.title)}" />
      </div>
      <div class="event-management-card__content">
        <div class="event-management-card__top">
          <span class="badge badge--${event.status || "upcoming"}">${escapeHtml(event.status || "upcoming")}</span>
          <span class="meta">${event.registeredCount ?? 0} registered</span>
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <p class="meta">${formatDate(event.date)} • ${escapeHtml(event.venue || "—")}</p>
        <div class="event-management-card__actions">
          <a href="../event-details.html?id=${event.id}" class="btn btn--ghost">View</a>
          <button type="button" class="btn btn--ghost" data-action="edit" data-event-id="${event.id}">Edit</button>
          <button type="button" class="btn btn--danger" data-action="delete" data-event-id="${event.id}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function initDashboardPage() {
  requireRole(ROLES.ADMIN, "login.html").then(async () => {
    const events = await fetchEvents();
    const users = await fetchUsers(ROLES.STUDENT);
    const registrationsSnap = await getDocs(collection(db, COLLECTIONS.REGISTRATIONS));
    const registrations = registrationsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    document.getElementById("total-events").textContent = events.length;
    document.getElementById("total-students").textContent = users.length;
    document.getElementById("total-registrations").textContent = registrations.length;
    document.getElementById("upcoming-events").textContent = events.filter((e) => (e.status || EVENT_STATUS.UPCOMING) === EVENT_STATUS.UPCOMING).length;

    const recentList = document.getElementById("recent-events-list");
    recentList.innerHTML = events
      .slice()
      .sort((a, b) => ((b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)) - (a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0))))
      .slice(0, 5)
      .map((event) => `
        <li class="list-row">
          <div>
            <strong>${escapeHtml(event.title)}</strong>
            <span>${formatDate(event.date)} • ${escapeHtml(event.category || "General")}</span>
          </div>
          <span class="badge badge--${event.status || "upcoming"}">${escapeHtml(event.status || "upcoming")}</span>
        </li>
      `)
      .join("");

    const topEvents = events
      .slice()
      .sort((a, b) => (b.registeredCount || 0) - (a.registeredCount || 0))
      .slice(0, 5);

    const mostRegisteredList = document.getElementById("most-registered-list");
    mostRegisteredList.innerHTML = topEvents
      .map((event) => `
        <li class="list-row">
          <div>
            <strong>${escapeHtml(event.title)}</strong>
            <span>${event.registeredCount ?? 0} registrations</span>
          </div>
          <span class="meta">${formatDate(event.date)}</span>
        </li>
      `)
      .join("");

    const registrationStats = document.getElementById("registration-stats");
    const stats = [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING, EVENT_STATUS.COMPLETED].map((status) => {
      const count = events.filter((event) => (event.status || EVENT_STATUS.UPCOMING) === status).length;
      return { status, count };
    });

    registrationStats.innerHTML = stats
      .map((stat) => `
        <div class="mini-stat">
          <p>${escapeHtml(stat.status)}</p>
          <strong>${stat.count}</strong>
        </div>
      `)
      .join("");
  });
}

function initCreateEventPage() {
  requireRole(ROLES.ADMIN, "login.html").then(() => {
    const form = document.getElementById("create-event-form");
    const input = document.getElementById("poster-file");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating event...";

      try {
        const formData = new FormData(form);
        const eventData = {
          title: formData.get("title").trim(),
          description: formData.get("description").trim(),
          category: formData.get("category"),
          department: formData.get("department"),
          date: formData.get("date"),
          startTime: formData.get("startTime"),
          endTime: formData.get("endTime"),
          venue: formData.get("venue").trim(),
          maxSeats: Number(formData.get("maxSeats")),
          registrationDeadline: formData.get("registrationDeadline") || null,
          status: formData.get("status"),
          organizer: formData.get("organizer").trim() || "Saraswati Group of Colleges",
          createdAt: serverTimestamp(),
          createdBy: "admin",
          registeredCount: 0,
        };

        const selectedFile = input.files[0];
        const newEventRef = doc(collection(db, COLLECTIONS.EVENTS));
        const newEventId = newEventRef.id;

        if (selectedFile) {
          const uploadedPoster = await uploadImageToCloudinary(
            selectedFile,
            `college-events/event-posters/${newEventId}`
          );

          eventData.posterURL = uploadedPoster.url;
        }

        await setDoc(newEventRef, eventData);
        setStatus("Event created successfully.", "success");
        form.reset();
      } catch (error) {
        console.error("Failed to create event:", error);
        setStatus("Unable to create event. Please try again.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Event";
      }
    });
  });
}

function renderManageEvents(events) {
  const container = document.getElementById("manage-events-list");
  if (!container) return;

  container.innerHTML = events
    .map((event) => makeEventCard(event))
    .join("");

  container.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", async () => {
      const eventId = button.dataset.eventId;
      const event = events.find((item) => item.id === eventId);
      if (!event) return;
      fillEventEditor(event);
    });
  });

  container.querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      const eventId = button.dataset.eventId;
      const confirmed = window.confirm("Delete this event? This cannot be undone.");
      if (!confirmed) return;
      try {
        await deleteDoc(doc(db, COLLECTIONS.EVENTS, eventId));
        const updatedEvents = await fetchEvents();
        renderManageEvents(updatedEvents);
        setStatus("Event deleted.", "success");
      } catch (error) {
        console.error("Failed to delete event:", error);
        setStatus("Unable to delete event.", "error");
      }
    });
  });
}

function fillEventEditor(event) {
  const form = document.getElementById("edit-event-form");
  if (!form) return;

  form.dataset.eventId = event.id;
  form.querySelector('[name="title"]').value = event.title || "";
  form.querySelector('[name="description"]').value = event.description || "";
  form.querySelector('[name="category"]').value = event.category || "Technical";
  form.querySelector('[name="department"]').value = event.department || "General";
  form.querySelector('[name="date"]').value = event.date || "";
  form.querySelector('[name="startTime"]').value = event.startTime || "";
  form.querySelector('[name="endTime"]').value = event.endTime || "";
  form.querySelector('[name="venue"]').value = event.venue || "";
  form.querySelector('[name="maxSeats"]').value = event.maxSeats || 0;
  form.querySelector('[name="registrationDeadline"]').value = event.registrationDeadline || "";
  form.querySelector('[name="organizer"]').value = event.organizer || "";
  form.querySelector('[name="status"]').value = event.status || EVENT_STATUS.UPCOMING;
  document.getElementById("edit-event-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function initManageEventsPage() {
  requireRole(ROLES.ADMIN, "login.html").then(async () => {
    const searchInput = document.getElementById("event-search");
    const filterSelect = document.getElementById("event-status-filter");
    const form = document.getElementById("edit-event-form");

    let cachedEvents = [];

    async function refresh() {
      cachedEvents = await fetchEvents();
      let filteredEvents = cachedEvents;

      const query = (searchInput?.value || "").trim().toLowerCase();
      const status = filterSelect?.value || "all";

      if (query) {
        filteredEvents = filteredEvents.filter((event) => {
          const text = `${event.title} ${event.category} ${event.venue}`.toLowerCase();
          return text.includes(query);
        });
      }

      if (status !== "all") {
        filteredEvents = filteredEvents.filter((event) => (event.status || EVENT_STATUS.UPCOMING) === status);
      }

      renderManageEvents(filteredEvents);
    }

    searchInput?.addEventListener("input", refresh);
    filterSelect?.addEventListener("change", refresh);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const eventId = form.dataset.eventId;
      if (!eventId) return;

      const formData = new FormData(form);
      const updateData = {
        title: formData.get("title").trim(),
        description: formData.get("description").trim(),
        category: formData.get("category"),
        department: formData.get("department"),
        date: formData.get("date"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        venue: formData.get("venue").trim(),
        maxSeats: Number(formData.get("maxSeats")),
        registrationDeadline: formData.get("registrationDeadline") || null,
        organizer: formData.get("organizer").trim() || "Saraswati Group of Colleges",
        status: formData.get("status"),
      };

      await updateDoc(doc(db, COLLECTIONS.EVENTS, eventId), updateData);
      setStatus("Event updated successfully.", "success");
      await refresh();
      form.reset();
      delete form.dataset.eventId;
    });

    await refresh();
  });
}

function initRegistrationsPage() {
  requireRole(ROLES.ADMIN, "login.html").then(async () => {
    const eventSelect = document.getElementById("registration-event-select");
    const tableBody = document.getElementById("registrations-table-body");
    const searchInput = document.getElementById("registrations-search");
    const exportBtn = document.getElementById("export-csv");

    console.log("===== ADMIN REGISTRATIONS DEBUG =====");
    console.log("Auth user:", auth.currentUser);
    console.log("Auth UID:", auth.currentUser?.uid);

    if (auth.currentUser) {
      const userSnap = await getDoc(
        doc(db, COLLECTIONS.USERS, auth.currentUser.uid)
      );

      console.log("Admin user document exists:", userSnap.exists());
      console.log("Admin user data:", userSnap.exists() ? userSnap.data() : null);
      console.log("Admin role:", userSnap.exists() ? userSnap.data().role : null);
    }

    console.log("====================================");

    const events = await fetchEvents();
    eventSelect.innerHTML = events
      .map((event) => `<option value="${event.id}">${escapeHtml(event.title)}</option>`)
      .join("");

    async function loadRegistrations() {
      const eventId = eventSelect.value;
      const event = events.find((item) => item.id === eventId);
      const registrations = await fetchRegistrations(eventId);

      const query = (searchInput.value || "").trim().toLowerCase();
      const filtered = registrations.filter((reg) => {
        const text = `${reg.studentName} ${reg.rollNo} ${reg.email} ${reg.department}`.toLowerCase();
        return text.includes(query);
      });

      document.getElementById("event-name-header").textContent = event ? event.title : "Event";
      document.getElementById("registration-count").textContent = `${filtered.length} / ${event?.maxSeats || registrations.length}`;

      tableBody.innerHTML = filtered
        .map((registration, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(registration.studentName || "—")}</td>
            <td>${escapeHtml(registration.rollNo || "—")}</td>
            <td>${escapeHtml(registration.department || "—")}</td>
            <td>${escapeHtml(registration.semester || "—")}</td>
            <td>${escapeHtml(registration.email || "—")}</td>
            <td>${formatDateTime(registration.registeredAt)}</td>
          </tr>
        `)
        .join("");

      exportBtn.disabled = filtered.length === 0;
    }

    eventSelect.addEventListener("change", loadRegistrations);
    searchInput.addEventListener("input", loadRegistrations);
    exportBtn.addEventListener("click", async () => {
      const eventId = eventSelect.value;
      const registrations = await fetchRegistrations(eventId);
      const rows = [
        ["#", "Student Name", "Roll Number", "Department", "Semester", "Email", "Registration Date"],
        ...registrations.map((reg, index) => [index + 1, reg.studentName || "", reg.rollNo || "", reg.department || "", reg.semester || "", reg.email || "", formatDateTime(reg.registeredAt)]),
      ];

      const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `registrations_${eventId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    await loadRegistrations();
  });
}

function initStudentsPage() {
  requireRole(ROLES.ADMIN, "login.html").then(async () => {
    const searchInput = document.getElementById("student-search");
    const tableBody = document.getElementById("students-table-body");
    const users = await fetchUsers(ROLES.STUDENT);

    const registrationsSnap = await getDocs(collection(db, COLLECTIONS.REGISTRATIONS));
    const allRegistrations = registrationsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    function renderRows(list) {
      tableBody.innerHTML = list
        .map((student) => {
          const registrationCount = allRegistrations.filter((reg) => reg.studentId === student.id).length;
          return `
            <tr>
              <td>${escapeHtml(student.name || "—")}</td>
              <td>${escapeHtml(student.rollNo || "—")}</td>
              <td>${escapeHtml(student.department || "—")}</td>
              <td>${escapeHtml(student.semester || "—")}</td>
              <td>${escapeHtml(student.email || "—")}</td>
              <td>${registrationCount}</td>
            </tr>
          `;
        })
        .join("");
    }

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = users.filter((student) => {
        const text = `${student.name} ${student.rollNo} ${student.department}`.toLowerCase();
        return text.includes(query);
      });
      renderRows(filtered);
    });

    renderRows(users);
  });
}

function initGalleryManagementPage() {
  requireRole(ROLES.ADMIN, "login.html").then(async () => {
    const select = document.getElementById("gallery-event-select");
    const fileInput = document.getElementById("gallery-files");
    const uploadBtn = document.getElementById("upload-gallery-btn");
    const galleryList = document.getElementById("gallery-preview-list");

    const events = await fetchEvents();
    select.innerHTML = events.map((event) => `<option value="${event.id}">${escapeHtml(event.title)}</option>`).join("");

    async function refreshGallery() {
      const eventId = select.value;
      const event = events.find((item) => item.id === eventId);
      const gallery = await fetchGallery(eventId);
      const photos = gallery?.photos || [];

      if (galleryList) {
        if (photos.length === 0) {
          galleryList.innerHTML = `<div class="state-panel"><p class="state-panel__title">No photos yet.</p><p>Upload the first gallery images for this event.</p></div>`;
          return;
        }

        galleryList.innerHTML = photos
          .map(
            (url, index) => `
              <div class="gallery-upload-item">
                <img src="${url}" alt="Gallery photo ${index + 1}" />
                <button type="button" class="btn btn--danger" data-delete-photo="${index}">Delete</button>
              </div>
            `
          )
          .join("");

        galleryList.querySelectorAll("[data-delete-photo]").forEach((button) => {
          button.addEventListener("click", async () => {
            const targetIndex = Number(button.dataset.deletePhoto);
            const updatedPhotos = photos.filter((_, index) => index !== targetIndex);
            await updateDoc(doc(db, COLLECTIONS.GALLERIES, eventId), {
              photos: updatedPhotos,
              coverImage: updatedPhotos[0] || gallery?.coverImage || "",
            });
            await refreshGallery();
          });
        });
      }

      document.getElementById("gallery-event-name").textContent = event ? `Managing gallery for ${event.title}` : "Select an event";
    }

    select.addEventListener("change", refreshGallery);

    uploadBtn.addEventListener("click", async () => {
      const eventId = select.value;
      const event = events.find((item) => item.id === eventId);
      const files = Array.from(fileInput.files || []);

      if (!files.length) {
        setStatus("Please choose at least one image to upload.", "error");
        return;
      }

      try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";

        const gallery = await fetchGallery(eventId);
        const existingPhotos = gallery?.photos || [];
        const uploadedUrls = [];

        for (const file of files) {
          const uploadedFile = await uploadImageToCloudinary(
            file,
            `college-events/event-galleries/${eventId}`
          );
          uploadedUrls.push(uploadedFile.url);
        }

        const combinedPhotos = [...existingPhotos, ...uploadedUrls];

        await setDoc(
          doc(db, COLLECTIONS.GALLERIES, eventId),
          {
            eventId,
            eventName: event?.title || "Event Gallery",
            description: `Photos for ${event?.title || "event"}`,
            coverImage: combinedPhotos[0] || event?.posterURL || "",
            photos: combinedPhotos,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        fileInput.value = "";
        setStatus("Gallery uploaded successfully.", "success");
        await refreshGallery();
      } catch (error) {
        console.error("Gallery upload failed:", error);
        setStatus("Image upload failed. Please try again.", "error");
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Upload Photos";
      }
    });

    await refreshGallery();
  });
}

function initPage() {
  if (page === "admin-dashboard") {
    initDashboardPage();
  }
  if (page === "admin-create-event") {
    initCreateEventPage();
  }
  if (page === "admin-manage-events") {
    initManageEventsPage();
  }
  if (page === "admin-registrations") {
    initRegistrationsPage();
  }
  if (page === "admin-students") {
    initStudentsPage();
  }
  if (page === "admin-gallery") {
    initGalleryManagementPage();
  }
}

document.addEventListener("DOMContentLoaded", initPage);
