const state = {
  token: null,
  currentUser: null,
  bookings: [],
  notifications: [],
  venues: [],
  users: [],
  timeSlots: [],
  selectedDates: [],
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
const timeSlotGridEl = document.getElementById("timeSlotGrid");
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
state.selectedTimeSlots = [];
state.activeSort = "date";
state.activeSortDirection = "asc";
state.dateMode = "single";

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
    const formatted = new Intl.DateTimeFormat("ar-TN-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${dateString}T00:00:00`));
    return formatted;
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

function populateBootstrap(data) {
  state.venues = data.venues;
  state.users = data.users;
  state.timeSlots = data.timeSlots;

  venueIdEl.innerHTML = data.venues
    .map((venue) => `<option value="${venue.id}">${venue.name} (${venue.capacity})</option>`)
    .join("");
  state.selectedTimeSlots = [];
  renderTimeSlots();
}

function getActiveBookings() {
  return state.bookings.filter((item) => item.status === "booked");
}

function getHistoryBookings() {
  return state.bookings.filter((item) => item.status !== "booked");
}

function compareValues(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortActiveBookings(bookings) {
  const field = state.activeSort;
  const factor = state.activeSortDirection === "desc" ? -1 : 1;
  return [...bookings].sort((left, right) => {
    let result = 0;
    if (field === "date") {
      result = compareValues(left.bookingDate, right.bookingDate) || compareValues(left.timeSlot, right.timeSlot);
    } else if (field === "time") {
      result = compareValues(left.timeSlot, right.timeSlot) || compareValues(left.bookingDate, right.bookingDate);
    } else if (field === "venue") {
      result = compareValues(left.venueName, right.venueName) || compareValues(left.bookingDate, right.bookingDate);
    } else if (field === "user") {
      result = compareValues(left.bookedBy, right.bookedBy) || compareValues(left.bookingDate, right.bookingDate);
    }
    return result * factor;
  });
}

function updateSortIndicators() {
  ["date", "time", "venue", "user"].forEach((field) => {
    const el = document.getElementById(`sort-${field}`);
    if (!el) return;
    el.textContent = state.activeSort === field ? (state.activeSortDirection === "asc" ? "↑" : "↓") : "↕";
  });
}

function updateDateModeUi() {
  const single = state.dateMode === "single";
  singleDateWrapEl.classList.toggle("hidden", !single);
  addDateBtn.classList.toggle("hidden", !single);
  rangeDateWrapEl.classList.toggle("hidden", single);
  addRangeBtn.classList.toggle("hidden", single);
}

function getSlotAvailability(slot) {
  const venueId = Number(venueIdEl.value);
  const selectedDates = parseDates();
  const editId = Number(bookingForm.dataset.editId || 0);
  if (!venueId || !selectedDates.length) {
    return { status: "open", conflicts: 0, total: selectedDates.length };
  }

  const conflictingDates = selectedDates.filter((date) =>
    state.bookings.some(
      (booking) =>
        booking.id !== editId &&
        booking.status === "booked" &&
        booking.venueId === venueId &&
        booking.timeSlot === slot &&
        booking.bookingDate === date
    )
  );

  if (!conflictingDates.length) {
    return { status: "open", conflicts: 0, total: selectedDates.length };
  }
  if (conflictingDates.length === selectedDates.length) {
    return { status: "booked", conflicts: conflictingDates.length, total: selectedDates.length };
  }
  return { status: "partial", conflicts: conflictingDates.length, total: selectedDates.length };
}

function renderTimeSlots() {
  state.selectedTimeSlots = state.selectedTimeSlots.filter((slot) => getSlotAvailability(slot).status !== "booked");

  timeSlotGridEl.innerHTML = state.timeSlots
    .map((slot) => {
      const availability = getSlotAvailability(slot);
      const isSelected = state.selectedTimeSlots.includes(slot);
      const classes = ["time-slot-btn"];
      let note = "Available";
      let disabled = "";

      if (availability.status === "partial") {
        classes.push("partial");
        note = `${availability.conflicts} date(s) booked`;
      } else if (availability.status === "booked") {
        classes.push("booked");
        note = "Booked";
        disabled = "disabled";
      }

      if (isSelected) {
        classes.push("selected");
      }

      return `
        <button
          type="button"
          class="${classes.join(" ")}"
          data-slot="${slot}"
          ${disabled}
        >
          <span>${slot}</span>
          <span class="time-slot-note">${note}</span>
        </button>
      `;
    })
    .join("");
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
          const disabled = false;
          const editButton = `<button class="secondary-btn" ${!canEdit || disabled ? "disabled" : ""} data-action="edit" data-id="${booking.id}">Edit</button>`;
          const deleteButton = `<button class="danger-btn" ${!canEdit || disabled ? "disabled" : ""} data-action="delete" data-id="${booking.id}">Cancel</button>`;
          return `
            <tr>
              <td>${escapeHtml(booking.bookingDate)}</td>
              <td>${escapeHtml(booking.timeSlot)}</td>
              <td>${escapeHtml(booking.venueName)}</td>
              <td>${escapeHtml(booking.bookedBy)}</td>
              <td>${escapeHtml(booking.purpose)}</td>
              <td>${escapeHtml(String(booking.audienceCount))}</td>
              <td><span class="status-pill status-${booking.status}">${escapeHtml(booking.status)}</span></td>
              <td><div class="table-actions">${editButton}${deleteButton}</div></td>
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
  tableTitle.textContent = state.currentUser.role === "admin" ? "Current active bookings" : "Your current active bookings";
  tableMessage.textContent = state.currentUser.role === "admin"
    ? "Admins can edit, cancel, and export all bookings."
    : "You can edit or cancel your own active bookings within 48 hours, unless admin grants extended rights.";
  historyMessage.textContent = "Previous and cancelled records are shown here without edit controls.";
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
          <span>48-hour override: ${user.canEditAfter48h ? "Enabled" : "Disabled"}</span><br /><br />
          <button class="secondary-btn" data-action="toggle-override" data-id="${user.id}" data-value="${user.canEditAfter48h ? "0" : "1"}">
            ${user.canEditAfter48h ? "Remove extra rights" : "Grant extra rights"}
          </button>
        </div>
      `
    )
    .join("");
}

function canManageBooking(booking) {
  if (state.currentUser.role === "admin") return true;
  if (booking.userId !== state.currentUser.id) return false;
  if (state.currentUser.canEditAfter48h) return true;
  const createdAt = new Date(booking.createdAt).getTime();
  const hoursElapsed = (Date.now() - createdAt) / (1000 * 60 * 60);
  return hoursElapsed <= 48;
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
  renderSelectedDates();
  renderTimeSlots();
  document.getElementById("audienceCount").value = booking.audienceCount;
  setCheckedValues("avitOptions", booking.avitRequirements);
  setCheckedValues("sittingOptions", booking.sittingArrangements);
  bookingForm.dataset.editId = booking.id;
  updateHijriPreview();
  setMessage(bookingMessage, `Editing booking ${booking.bookingCode}. Submit to save changes.`, "success");
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
  renderSelectedDates();
  renderTimeSlots();
  updateHijriPreview();
  setCheckedValues("avitOptions", []);
  setCheckedValues("sittingOptions", []);
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

function addSelectedDate() {
  const value = datePickerEl.value;
  if (!value) {
    setMessage(bookingMessage, "Please choose a date from the calendar first.", "error");
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

  const mergedDates = new Set([...state.selectedDates, ...datesToAdd]);
  state.selectedDates = [...mergedDates].sort();
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
    setMessage(bookingMessage, "Enter at least one Gregorian date.", "error");
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
      setMessage(bookingMessage, "Booking updated successfully.", "success");
    } else {
      await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage(bookingMessage, "Booked successfully.", "success");
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
          setMessage(bookingMessage, "Available dates booked successfully.", "success");
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

timeSlotGridEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-slot]");
  if (!button || button.disabled) return;
  const slot = button.dataset.slot;
  if (state.selectedTimeSlots.includes(slot)) {
    state.selectedTimeSlots = state.selectedTimeSlots.filter((item) => item !== slot);
  } else {
    state.selectedTimeSlots.push(slot);
    state.selectedTimeSlots.sort();
  }
  renderTimeSlots();
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
    // Ignore logout errors and return to login view.
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
      if (!response.ok) {
        throw new Error("Export failed.");
      }
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
  const historySection = document.getElementById("historySection");
  const wasOpen = historySection.open;
  window.print();
  historySection.open = wasOpen;
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
