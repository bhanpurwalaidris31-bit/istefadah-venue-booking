const state = {
  token: null,
  currentUser: null,
  bookings: [],
  notifications: [],
  venues: [],
  users: [],
  timeSlots: [],
  selectedDates: [],
  selectedTimeSlots: [],
  activeSort: "date",
  activeSortDirection: "asc",
  dateMode: "single",
};

const AVIT_OPTIONS = ["Projector", "Sound system", "Microphone", "Recording", "Live streaming", "Hybrid meeting"];
const SITTING_OPTIONS = ["Sujni", "Podium", "Boardroom", "U-shape", "Round tables", "Floor seating"];

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const bookingForm = document.getElementById("bookingForm");
const loginMessage = document.getElementById("loginMessage");
const bookingMessage = document.getElementById("bookingMessage");
const tableMessage = document.getElementById("tableMessage");
const historyMessage = document.getElementById("historyMessage");
const welcomeText = document.getElementById("welcomeText");
const metricBookings = document.getElementById("metricBookings");
const metricHistory = document.getElementById("metricHistory");
const metricNotifications = document.getElementById("metricNotifications");
const activeBookingTableBody = document.getElementById("activeBookingTableBody");
const historyBookingTableBody = document.getElementById("historyBookingTableBody");
const notificationsEl = document.getElementById("notifications");
const venueIdEl = document.getElementById("venueId");
const timeSlotToggleEl = document.getElementById("timeSlotToggle");
const timeSlotSummaryEl = document.getElementById("timeSlotSummary");
const timeSlotMenuEl = document.getElementById("timeSlotMenu");
const bookedByEl = document.getElementById("bookedBy");
const datePickerEl = document.getElementById("datePicker");
const singleDateWrapEl = document.getElementById("singleDateWrap");
const rangeDateWrapEl = document.getElementById("rangeDateWrap");
const rangeStartDateEl = document.getElementById("rangeStartDate");
const rangeEndDateEl = document.getElementById("rangeEndDate");
const hijriPreviewEl = document.getElementById("hijriPreview");
const adminSection = document.getElementById("adminSection");
const adminUsers = document.getElementById("adminUsers");
const tableTag = document.getElementById("tableTag");
const tableTitle = document.getElementById("tableTitle");
const selectedDatesEl = document.getElementById("selectedDates");
const addDateBtn = document.getElementById("addDateBtn");
const addRangeBtn = document.getElementById("addRangeBtn");
const clearDatesBtn = document.getElementById("clearDatesBtn");
const clearSlotsBtn = document.getElementById("clearSlotsBtn");
const printReportBtn = document.getElementById("printReportBtn");

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token) headers["X-Session-Token"] = state.token;

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.error || "Request failed.";
    const error = new Error(message);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCheckboxGroup(containerId, options) {
  const container = document.getElementById(containerId);
  container.innerHTML = options
    .map(
      (option) => `
        <label class="checkbox-pill">
          <input type="checkbox" value="${option}" />
          <span>${option}</span>
        </label>
      `
    )
    .join("");
}

function getCheckedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((input) => input.value);
}

function setCheckedValues(containerId, values) {
  const valueSet = new Set(values);
  document.querySelectorAll(`#${containerId} input`).forEach((input) => {
    input.checked = valueSet.has(input.value);
  });
}

function parseDates() {
  return [...state.selectedDates];
}

function formatHijri(dateString) {
  try {
    return new Intl.DateTimeFormat("ar-TN-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${dateString}T00:00:00`));
  } catch {
    return "تعذر التحويل";
  }
}

function updateHijriPreview() {
  const dates = parseDates();
  hijriPreviewEl.classList.add("hijri-arabic");
  hijriPreviewEl.value = dates.length
    ? dates.map((date) => `${formatHijri(date)} : ${date}`).join("\n")
    : "سيظهر التاريخ الهجري هنا بعد اختيار التاريخ الميلادي.";
}

function compareValues(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function getActiveBookings() {
  return state.bookings.filter((item) => item.status === "pending" || item.status === "approved");
}

function getHistoryBookings() {
  return state.bookings.filter((item) => item.status === "cancelled");
}

function sortActiveBookings(bookings) {
  const factor = state.activeSortDirection === "desc" ? -1 : 1;
  return [...bookings].sort((left, right) => {
    let result = 0;
    if (state.activeSort === "date") {
      result = compareValues(left.bookingDate, right.bookingDate) || compareValues(left.timeSlot, right.timeSlot);
    } else if (state.activeSort === "time") {
      result = compareValues(left.timeSlot, right.timeSlot) || compareValues(left.bookingDate, right.bookingDate);
    } else if (state.activeSort === "venue") {
      result = compareValues(left.venueName, right.venueName) || compareValues(left.bookingDate, right.bookingDate);
    } else if (state.activeSort === "user") {
      result = compareValues(left.bookedBy, right.bookedBy) || compareValues(left.bookingDate, right.bookingDate);
    }
    return result * factor;
  });
}

function updateSortIndicators() {
  ["date", "time", "venue", "user"].forEach((field) => {
    const el = document.getElementById(`sort-${field}`);
    if (!el) return;
    el.textContent = state.activeSort === field
      ? (state.activeSortDirection === "asc" ? "↑" : "↓")
      : "↕";
  });
}

function updateDateModeUi() {
  const isSingle = state.dateMode === "single";
  singleDateWrapEl.classList.toggle("hidden", !isSingle);
  addDateBtn.classList.toggle("hidden", !isSingle);
  rangeDateWrapEl.classList.toggle("hidden", isSingle);
  addRangeBtn.classList.toggle("hidden", isSingle);
}

function populateBootstrap(data) {
  state.venues = data.venues;
  state.users = data.users;
  state.timeSlots = data.timeSlots;
  venueIdEl.innerHTML = data.venues
    .map((venue) => `<option value="${venue.id}">${venue.name} (${venue.capacity})</option>`)
    .join("");
  renderTimeSlots();
}

function updateTimeSlotSummary() {
  if (!state.selectedTimeSlots.length) {
    timeSlotSummaryEl.textContent = "Select time slot(s)";
    return;
  }
  if (state.selectedTimeSlots.length === 1) {
    timeSlotSummaryEl.textContent = state.selectedTimeSlots[0];
    return;
  }
  timeSlotSummaryEl.textContent = `${state.selectedTimeSlots.length} slots selected`;
}

function getSlotAvailability(slot) {
  const venueId = Number(venueIdEl.value);
  const selectedDates = parseDates();
  const editId = Number(bookingForm.dataset.editId || 0);
  if (!venueId || !selectedDates.length) {
    return { status: "open", conflicts: 0 };
  }

  const conflicts = selectedDates.filter((date) =>
    state.bookings.some(
      (booking) =>
        booking.id !== editId &&
        (booking.status === "approved" || booking.status === "pending") &&
        booking.venueId === venueId &&
        booking.timeSlot === slot &&
        booking.bookingDate === date
    )
  );

  if (!conflicts.length) return { status: "open", conflicts: 0 };
  if (conflicts.length === selectedDates.length) return { status: "booked", conflicts: conflicts.length };
  return { status: "partial", conflicts: conflicts.length };
}

function renderTimeSlots() {
  state.selectedTimeSlots = state.selectedTimeSlots.filter((slot) => getSlotAvailability(slot).status !== "booked");
  const visibleSlots = state.timeSlots.filter((slot) => getSlotAvailability(slot).status !== "booked");
  timeSlotMenuEl.innerHTML = visibleSlots
    .map((slot) => {
      const availability = getSlotAvailability(slot);
      const checked = state.selectedTimeSlots.includes(slot) ? "checked" : "";
      const partialClass = availability.status === "partial" ? "partial" : "";
      const note = availability.status === "partial" ? `<span class="slot-option-note">${availability.conflicts} date clash</span>` : "";
      return `
        <label class="slot-option ${partialClass}">
          <span class="slot-option-text">${slot}</span>
          ${note}
          <input type="checkbox" value="${slot}" ${checked} />
        </label>
      `;
    })
    .join("");
  updateTimeSlotSummary();
}

function renderSelectedDates() {
  selectedDatesEl.innerHTML = state.selectedDates.length
    ? state.selectedDates
        .map(
          (date) => `
            <span class="date-chip">
              <span>${escapeHtml(date)}</span>
              <button type="button" class="chip-remove" data-date="${date}">x</button>
            </span>
          `
        )
        .join("")
    : `<span class="hint">No dates selected yet.</span>`;
  updateHijriPreview();
}

function canManageBooking(booking) {
  if (state.currentUser.role === "admin") return true;
  if (booking.userId !== state.currentUser.id) return false;
  if (state.currentUser.canEditAfter48h) return true;
  if (booking.status === "approved") return false;
  const createdAt = new Date(booking.createdAt).getTime();
  const hoursElapsed = (Date.now() - createdAt) / (1000 * 60 * 60);
  return hoursElapsed <= 6;
}

function renderBookings() {
  const activeBookings = sortActiveBookings(getActiveBookings());
  const historyBookings = getHistoryBookings();
  metricBookings.textContent = `${activeBookings.length}`;
  metricHistory.textContent = `${historyBookings.length}`;

  activeBookingTableBody.innerHTML = activeBookings.length
    ? activeBookings
        .map((booking) => {
          const canEdit = canManageBooking(booking);
          const approveButton = state.currentUser.role === "admin" && booking.status === "pending"
            ? `<button class="primary-btn" data-action="approve" data-id="${booking.id}">Approve</button>`
            : "";
          const editButton = booking.status === "pending"
            ? `<button class="secondary-btn" ${!canEdit ? "disabled" : ""} data-action="edit" data-id="${booking.id}">Edit</button>`
            : "";
          const cancelButton = `<button class="danger-btn" ${!canEdit ? "disabled" : ""} data-action="delete" data-id="${booking.id}">Cancel</button>`;
          return `
            <tr>
              <td>${escapeHtml(booking.bookingDate)}</td>
              <td>${escapeHtml(booking.timeSlot)}</td>
              <td>${escapeHtml(booking.venueName)}</td>
              <td>${escapeHtml(booking.bookedBy)}</td>
              <td>${escapeHtml(booking.purpose)}</td>
              <td>${escapeHtml(String(booking.audienceCount))}</td>
              <td><span class="status-pill status-${booking.status}">${escapeHtml(booking.status)}</span></td>
              <td><div class="table-actions">${approveButton}${editButton}${cancelButton}</div></td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="8">No bookings found.</td></tr>`;

  historyBookingTableBody.innerHTML = historyBookings.length
    ? historyBookings
        .map(
          (booking) => `
            <tr>
              <td>${escapeHtml(booking.bookingDate)}</td>
              <td>${escapeHtml(booking.timeSlot)}</td>
              <td>${escapeHtml(booking.venueName)}</td>
              <td>${escapeHtml(booking.bookedBy)}</td>
              <td>${escapeHtml(booking.purpose)}</td>
              <td>${escapeHtml(String(booking.audienceCount))}</td>
              <td><span class="status-pill status-${booking.status}">${escapeHtml(booking.status)}</span></td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7">No booking history found.</td></tr>`;

  tableTag.textContent = state.currentUser.role === "admin" ? "All Bookings" : "My Bookings";
  tableTitle.textContent = state.currentUser.role === "admin" ? "Approval and active bookings" : "Your pending and approved bookings";
  tableMessage.textContent = state.currentUser.role === "admin"
    ? "Admins can approve pending bookings and cancel any booking."
    : "Pending bookings can be edited for 6 hours. Approved bookings are locked from editing.";
  historyMessage.textContent = "Cancelled records are shown here.";
  updateSortIndicators();
}

function renderNotifications() {
  metricNotifications.textContent = `${state.notifications.length}`;
  notificationsEl.innerHTML = state.notifications.length
    ? state.notifications
        .map(
          (item) => `
            <div class="notification-item">
              <strong>${new Date(item.createdAt).toLocaleString()}</strong>
              <p>${escapeHtml(item.message)}</p>
            </div>
          `
        )
        .join("")
    : `<div class="notification-item">No notifications yet.</div>`;
}

function renderAdminUsers() {
  if (state.currentUser.role !== "admin") {
    adminSection.classList.add("hidden");
    return;
  }
  adminSection.classList.remove("hidden");
  adminUsers.innerHTML = state.users
    .filter((user) => user.role === "user")
    .map(
      (user) => `
        <div class="admin-user-item">
          <strong>${escapeHtml(user.name)}</strong><br />
          <span>${escapeHtml(user.email)}</span><br />
          <span>Extended edit override: ${user.canEditAfter48h ? "Enabled" : "Disabled"}</span><br /><br />
          <button class="secondary-btn" data-action="toggle-override" data-id="${user.id}" data-value="${user.canEditAfter48h ? "0" : "1"}">
            ${user.canEditAfter48h ? "Remove extra rights" : "Grant extra rights"}
          </button>
        </div>
      `
    )
    .join("");
}

async function refreshData() {
  const [bookingsPayload, notificationsPayload, bootstrapPayload] = await Promise.all([
    api("/api/bookings"),
    api("/api/notifications"),
    api("/api/bootstrap"),
  ]);
  state.bookings = bookingsPayload.bookings;
  state.notifications = notificationsPayload.notifications;
  state.users = bootstrapPayload.users;
  const refreshedUser = state.users.find((user) => user.id === state.currentUser.id);
  if (refreshedUser) {
    state.currentUser = { ...state.currentUser, ...refreshedUser };
  }
  renderTimeSlots();
  renderBookings();
  renderNotifications();
  renderAdminUsers();
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  welcomeText.textContent = state.currentUser.name;
  bookedByEl.value = state.currentUser.name;
  renderSelectedDates();
  renderTimeSlots();
}

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
  state.token = null;
  state.currentUser = null;
}

function fillBookingForm(booking) {
  bookedByEl.value = booking.bookedBy;
  document.getElementById("purpose").value = booking.purpose;
  venueIdEl.value = booking.venueId;
  state.selectedTimeSlots = [booking.timeSlot];
  state.selectedDates = [booking.bookingDate];
  document.getElementById("audienceCount").value = booking.audienceCount;
  setCheckedValues("avitOptions", booking.avitRequirements);
  setCheckedValues("sittingOptions", booking.sittingArrangements);
  bookingForm.dataset.editId = booking.id;
  renderSelectedDates();
  renderTimeSlots();
  setMessage(bookingMessage, `Editing pending booking ${booking.bookingCode}. Submit to save changes.`, "success");
}

function resetBookingForm() {
  bookingForm.reset();
  delete bookingForm.dataset.editId;
  bookedByEl.value = state.currentUser?.name || "";
  state.selectedTimeSlots = [];
  state.selectedDates = [];
  state.dateMode = "single";
  document.querySelector("input[name='dateMode'][value='single']").checked = true;
  updateDateModeUi();
  setCheckedValues("avitOptions", []);
  setCheckedValues("sittingOptions", []);
  renderSelectedDates();
  renderTimeSlots();
}

function addSelectedDate() {
  const value = datePickerEl.value;
  if (!value) {
    setMessage(bookingMessage, "Please choose a date first.", "error");
    return;
  }
  if (!state.selectedDates.includes(value)) {
    state.selectedDates.push(value);
    state.selectedDates.sort();
  }
  datePickerEl.value = "";
  renderSelectedDates();
  renderTimeSlots();
  setMessage(bookingMessage, "");
}

function addDateRange() {
  const start = rangeStartDateEl.value;
  const end = rangeEndDateEl.value;
  if (!start || !end) {
    setMessage(bookingMessage, "Please choose both start and end dates.", "error");
    return;
  }
  if (start > end) {
    setMessage(bookingMessage, "End date must be after or equal to start date.", "error");
    return;
  }
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const datesToAdd = [];
  while (cursor <= endDate) {
    datesToAdd.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  state.selectedDates = [...new Set([...state.selectedDates, ...datesToAdd])].sort();
  rangeStartDateEl.value = "";
  rangeEndDateEl.value = "";
  renderSelectedDates();
  renderTimeSlots();
  setMessage(bookingMessage, "");
}

async function bootstrap() {
  renderCheckboxGroup("avitOptions", AVIT_OPTIONS);
  renderCheckboxGroup("sittingOptions", SITTING_OPTIONS);
  const data = await api("/api/bootstrap", { headers: { "Content-Type": "application/json" } });
  populateBootstrap(data);
  updateDateModeUi();
  updateHijriPreview();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Signing in...");
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      }),
    });
    state.token = payload.token;
    state.currentUser = payload.user;
    showApp();
    await refreshData();
    setMessage(loginMessage, "");
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const isEdit = Boolean(bookingForm.dataset.editId);
  const payload = {
    bookedBy: bookedByEl.value,
    purpose: document.getElementById("purpose").value,
    venueId: Number(venueIdEl.value),
    timeSlot: state.selectedTimeSlots[0] || "",
    timeSlots: [...state.selectedTimeSlots],
    dates: parseDates(),
    bookingDate: parseDates()[0],
    audienceCount: Number(document.getElementById("audienceCount").value),
    avitRequirements: getCheckedValues("avitOptions"),
    sittingArrangements: getCheckedValues("sittingOptions"),
  };

  if (!payload.dates.length) {
    setMessage(bookingMessage, "Please select at least one date.", "error");
    return;
  }
  if (!payload.timeSlots.length) {
    setMessage(bookingMessage, "Please select at least one time slot.", "error");
    return;
  }

  try {
    if (isEdit) {
      await api(`/api/bookings/${bookingForm.dataset.editId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMessage(bookingMessage, "Pending booking updated successfully.", "success");
    } else {
      await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage(bookingMessage, "Booking request submitted for approval.", "success");
    }
    resetBookingForm();
    await refreshData();
  } catch (error) {
    if (error.status === 409 && error.payload?.availableSelections?.length) {
      const confirmed = window.confirm(
        `${error.payload.conflicts.map((item) => item.message).join("\n")}\n\n${error.payload.prompt}`
      );
      if (confirmed) {
        try {
          await api("/api/bookings", {
            method: "POST",
            body: JSON.stringify({ ...payload, allowPartial: true }),
          });
          setMessage(bookingMessage, "Remaining available selections submitted for approval.", "success");
          resetBookingForm();
          await refreshData();
          return;
        } catch (retryError) {
          setMessage(bookingMessage, retryError.message, "error");
          return;
        }
      }
    }
    setMessage(bookingMessage, error.message, "error");
  }
});

addDateBtn.addEventListener("click", addSelectedDate);
addRangeBtn.addEventListener("click", addDateRange);

clearDatesBtn.addEventListener("click", () => {
  state.selectedDates = [];
  renderSelectedDates();
  renderTimeSlots();
});

clearSlotsBtn.addEventListener("click", () => {
  state.selectedTimeSlots = [];
  renderTimeSlots();
});

selectedDatesEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-date]");
  if (!button) return;
  state.selectedDates = state.selectedDates.filter((date) => date !== button.dataset.date);
  renderSelectedDates();
  renderTimeSlots();
});

timeSlotToggleEl.addEventListener("click", () => {
  timeSlotMenuEl.classList.toggle("hidden");
});

timeSlotMenuEl.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[type='checkbox']");
  if (!checkbox) return;
  if (checkbox.checked) {
    if (!state.selectedTimeSlots.includes(checkbox.value)) {
      state.selectedTimeSlots.push(checkbox.value);
      state.selectedTimeSlots.sort();
    }
  } else {
    state.selectedTimeSlots = state.selectedTimeSlots.filter((slot) => slot !== checkbox.value);
  }
  updateTimeSlotSummary();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".slot-dropdown")) {
    timeSlotMenuEl.classList.add("hidden");
  }
});

venueIdEl.addEventListener("change", () => {
  renderTimeSlots();
});

document.querySelectorAll("input[name='dateMode']").forEach((input) => {
  input.addEventListener("change", () => {
    state.dateMode = input.value;
    updateDateModeUi();
  });
});

document.querySelectorAll(".sort-header").forEach((button) => {
  button.addEventListener("click", () => {
    const field = button.dataset.sortField;
    if (state.activeSort === field) {
      state.activeSortDirection = state.activeSortDirection === "asc" ? "desc" : "asc";
    } else {
      state.activeSort = field;
      state.activeSortDirection = "asc";
    }
    renderBookings();
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => refreshData());

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {
    // Ignore logout errors
  }
  showLogin();
  resetBookingForm();
});

document.querySelectorAll(".export-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    const format = button.dataset.format;
    try {
      const response = await fetch(`/api/export?format=${format}`, {
        headers: { "X-Session-Token": state.token },
      });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const extension = format === "excel" ? "xls" : format === "word" ? "doc" : "csv";
      link.href = url;
      link.download = `istefadah-bookings.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(tableMessage, error.message, "error");
    }
  });
});

printReportBtn.addEventListener("click", () => {
  window.print();
});

activeBookingTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const bookingId = Number(button.dataset.id);
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return;

  if (button.dataset.action === "edit") {
    fillBookingForm(booking);
    return;
  }

  if (button.dataset.action === "approve") {
    try {
      await api(`/api/bookings/${bookingId}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(bookingMessage, "Booking approved successfully.", "success");
      await refreshData();
    } catch (error) {
      setMessage(bookingMessage, error.message, "error");
    }
    return;
  }

  if (button.dataset.action === "delete") {
    const confirmed = window.confirm(`Cancel booking ${booking.bookingCode}?`);
    if (!confirmed) return;
    try {
      await api(`/api/bookings/${bookingId}`, { method: "DELETE" });
      setMessage(bookingMessage, "Booking cancelled successfully.", "success");
      await refreshData();
    } catch (error) {
      setMessage(bookingMessage, error.message, "error");
    }
  }
});

adminUsers.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='toggle-override']");
  if (!button) return;
  try {
    await api(`/api/admin/users/${button.dataset.id}/override`, {
      method: "POST",
      body: JSON.stringify({ canEditAfter48h: button.dataset.value === "1" }),
    });
    await refreshData();
  } catch (error) {
    setMessage(tableMessage, error.message, "error");
  }
});

bootstrap().catch((error) => {
  setMessage(loginMessage, error.message, "error");
});
