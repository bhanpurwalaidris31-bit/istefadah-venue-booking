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

const AVIT_OPTIONS = ["Projector", "Sound system", "Microphone", "Recording", "Live streaming"];
const SITTING_OPTIONS = ["Sujni", "Podium", "Boardroom", "Round tables", "Chairs"];

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
const createUserForm = document.getElementById("createUserForm");
const createUserMessage = document.getElementById("createUserMessage");
const passwordSection = document.getElementById("passwordSection");
const passwordForm = document.getElementById("passwordForm");
const passwordMessage = document.getElementById("passwordMessage");
const passwordResetHint = document.getElementById("passwordResetHint");
const bookingSection = document.getElementById("bookingSection");
const historySection = document.getElementById("historySection");
const logSection = document.getElementById("logSection");
const exportSection = document.getElementById("exportSection");
const tableTag = document.getElementById("tableTag");
const tableTitle = document.getElementById("tableTitle");
const selectedDatesEl = document.getElementById("selectedDates");
const addDateBtn = document.getElementById("addDateBtn");
const addRangeBtn = document.getElementById("addRangeBtn");
const clearDatesBtn = document.getElementById("clearDatesBtn");
const clearSlotsBtn = document.getElementById("clearSlotsBtn");
const printReportBtn = document.getElementById("printReportBtn");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const adminClearBookingsBtn = document.getElementById("adminClearBookingsBtn");

// Edit helpers
const editModeHelperEl = document.getElementById("editModeHelper");
const editingCodeDisplayEl = document.getElementById("editingCodeDisplay");
const editChangeDateBtn = document.getElementById("editChangeDateBtn");
const editChangeTimeBtn = document.getElementById("editChangeTimeBtn");

function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    document.body.appendChild(container);
  }
  
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.15);
    font-family: Calibri, Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => { toast.style.opacity = "1"; }, 10);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => { toast.remove(); }, 300);
  }, 4000);

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Istefadah Booking Update", { body: message });
  }
}

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
  return state.bookings.filter(
    (item) =>
      item.status === "cancelled" ||
      item.status === "completed"
  );
}

function formatRequirements(booking) {
  const avit = booking.avitRequirements || [];
  const sitting = booking.sittingArrangements || [];
  const parts = [];
  if (avit.length > 0) {
    parts.push(`AVIT: ${avit.join(", ")}`);
  }
  if (sitting.length > 0) {
    parts.push(`Sitting: ${sitting.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : "—";
}

function mergeTimeSlots(slots) {
  if (!slots || slots.length === 0) return "";
  const sorted = [...slots].sort((a, b) => {
    return a.split("-")[0].localeCompare(b.split("-")[0]);
  });
  
  const merged = [];
  let currentStart = null;
  let currentEnd = null;
  
  for (const slot of sorted) {
    const [start, end] = slot.split("-");
    if (currentStart === null) {
      currentStart = start;
      currentEnd = end;
    } else if (start === currentEnd) {
      currentEnd = end;
    } else {
      merged.push(`${currentStart}-${currentEnd}`);
      currentStart = start;
      currentEnd = end;
    }
  }
  if (currentStart !== null) {
    merged.push(`${currentStart}-${currentEnd}`);
  }
  return merged.join(", ");
}

function getContinuousBlocks(dates) {
  const sorted = [...new Set(dates)].sort();
  const blocks = [];
  let currentBlock = [];
  for (const dStr of sorted) {
    if (currentBlock.length === 0) {
      currentBlock.push(dStr);
    } else {
      const prevDate = new Date(`${currentBlock[currentBlock.length - 1]}T00:00:00`);
      prevDate.setDate(prevDate.getDate() + 1);
      const expectedStr = prevDate.toISOString().slice(0, 10);
      if (dStr === expectedStr) {
        currentBlock.push(dStr);
      } else {
        blocks.push(currentBlock);
        currentBlock = [dStr];
      }
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }
  return blocks;
}

function clubBookings(bookingsList) {
  const codeGroups = {};
  for (const b of bookingsList) {
    const code = b.bookingCode || `GEN-${b.id}`;
    if (!codeGroups[code]) {
      codeGroups[code] = [];
    }
    codeGroups[code].push(b);
  }

  const resultRows = [];

  for (const code of Object.keys(codeGroups)) {
    const items = codeGroups[code];
    const dates = items.map(item => item.bookingDate);
    const dateBlocks = getContinuousBlocks(dates);

    for (const block of dateBlocks) {
      const blockItems = items.filter(item => block.includes(item.bookingDate));
      const slots = [...new Set(blockItems.map(item => item.timeSlot))];
      
      const startTimes = slots.map(s => s.split("-")[0]);
      const endTimes = slots.map(s => s.split("-")[1]);
      startTimes.sort();
      endTimes.sort();

      const startTime = startTimes[0] || "—";
      const endTime = endTimes[endTimes.length - 1] || "—";
      const fromDate = block[0];
      const toDate = block[block.length - 1];
      const ref = blockItems[0];

      resultRows.push({
        id: ref.id,
        ids: blockItems.map(item => item.id),
        bookingCode: ref.bookingCode,
        userId: ref.userId,
        bookedBy: ref.bookedBy,
        ownerName: ref.ownerName,
        ownerEmail: ref.ownerEmail,
        venueId: ref.venueId,
        venueName: ref.venueName,
        venueCapacity: ref.venueCapacity,
        purpose: ref.purpose,
        audienceCount: ref.audienceCount,
        audienceDetails: ref.audienceDetails,
        avitRequirements: ref.avitRequirements,
        sittingArrangements: ref.sittingArrangements,
        status: ref.status,
        createdAt: ref.createdAt,
        updatedAt: ref.updatedAt,
        fromDate: fromDate,
        toDate: toDate,
        startTime: startTime,
        endTime: endTime,
        rawDates: block,
        rawTimeSlots: slots.sort()
      });
    }
  }

  return resultRows;
}

function sortActiveBookings(bookings) {
  const factor = state.activeSortDirection === "desc" ? -1 : 1;
  return [...bookings].sort((left, right) => {
    let result = 0;
    if (state.activeSort === "date") {
      result = compareValues(left.fromDate, right.fromDate) || compareValues(left.startTime, right.startTime);
    } else if (state.activeSort === "time") {
      result = compareValues(left.startTime, right.startTime) || compareValues(left.fromDate, right.fromDate);
    } else if (state.activeSort === "venue") {
      result = compareValues(left.venueName, right.venueName) || compareValues(left.fromDate, right.fromDate);
    } else if (state.activeSort === "user") {
      result = compareValues(left.bookedBy, right.bookedBy) || compareValues(left.fromDate, right.fromDate);
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

function populateTableFilters() {
  const venueFilterEl = document.getElementById("venueDetailFilter");
  if (venueFilterEl) {
    const details = [...new Set(state.venues.map(v => v.details).filter(Boolean))].sort();
    const currentSelection = venueFilterEl.value || "all";
    venueFilterEl.innerHTML = `<option value="all">All Groups</option>` +
      details.map(detail => `<option value="${detail}">${detail}</option>`).join("");
    venueFilterEl.value = details.includes(currentSelection) ? currentSelection : "all";
  }

  const userFilterEl = document.getElementById("userDetailFilter");
  if (userFilterEl) {
    // Only fetch non-scrubbed usernames for standard users
    const users = [...new Set(state.bookings.map(b => b.bookedBy).filter(b => b !== "Unavailable Slot"))].sort();
    const currentSelection = userFilterEl.value || "all";
    userFilterEl.innerHTML = `<option value="all">All Users</option>` +
      users.map(u => `<option value="${u}">${u}</option>`).join("");
    userFilterEl.value = users.includes(currentSelection) ? currentSelection : "all";
  }

  const dateFilterEl = document.getElementById("dateDetailFilter");
  if (dateFilterEl) {
    let allDates = [];
    state.bookings.forEach(b => {
      if (b.rawDates && b.rawDates.length) {
        allDates.push(...b.rawDates);
      } else if (b.bookingDate) {
        allDates.push(b.bookingDate);
      }
    });
    const uniqueDates = [...new Set(allDates)].filter(Boolean).sort();
    const currentSelection = dateFilterEl.value || "all";
    dateFilterEl.innerHTML = `<option value="all">All Dates</option>` +
      uniqueDates.map(d => `<option value="${d}">${d}</option>`).join("");
    dateFilterEl.value = uniqueDates.includes(currentSelection) ? currentSelection : "all";
  }
}

function updateVenueBusyTimes() {
  const venueId = Number(venueIdEl.value);
  const busyTimesEl = document.getElementById("venueBusyTimes");
  if (!busyTimesEl) return;
  if (!venueId) {
    busyTimesEl.textContent = "Select a venue to check unavailable slots...";
    return;
  }

  const activeBookings = state.bookings.filter(
    (b) => b.venueId === venueId && (b.status === "approved" || b.status === "pending")
  );

  if (!activeBookings.length) {
    busyTimesEl.textContent = "All dates and time slots are currently open!";
    return;
  }

  const schedule = {};
  activeBookings.forEach((b) => {
    const date = b.bookingDate;
    if (!schedule[date]) {
      schedule[date] = [];
    }
    if (!schedule[date].includes(b.timeSlot)) {
      schedule[date].push(b.timeSlot);
    }
  });

  const lines = [];
  const sortedDates = Object.keys(schedule).sort();
  sortedDates.forEach((date) => {
    const mergedSlots = mergeTimeSlots(schedule[date]);
    lines.push(`• ${date}: ${mergedSlots}`);
  });

  busyTimesEl.innerHTML = lines.map(line => `<div style="margin-bottom:2px;">${escapeHtml(line)}</div>`).join("");
}

function populateBootstrap(data) {
  state.venues = data.venues;
  state.users = data.users;
  state.timeSlots = data.timeSlots;
  venueIdEl.innerHTML = data.venues
    .map((venue) => `<option value="${venue.id}">${venue.name} (${venue.capacity})</option>`)
    .join("");
  renderTimeSlots();
  populateTableFilters();
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
  const editCode = bookingForm.dataset.editCode || "";
  
  if (!venueId || !selectedDates.length) {
    return { status: "open", conflicts: 0 };
  }

  const conflicts = selectedDates.filter((date) =>
    state.bookings.some(
      (booking) =>
        booking.id !== editId &&
        booking.bookingCode !== editCode &&
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

function updateBulkActionsBar() {
  const bulkBar = document.getElementById("bulkAdminActions");
  if (!bulkBar) return;
  const anyChecked = document.querySelectorAll(".pending-select-cb:checked").length > 0;
  bulkBar.classList.toggle("hidden", !anyChecked);
}

function renderBookings() {
  const venueFilterEl = document.getElementById("venueDetailFilter");
  const userFilterEl = document.getElementById("userDetailFilter");
  const dateFilterEl = document.getElementById("dateDetailFilter");

  const selectedVenueDetail = venueFilterEl ? venueFilterEl.value : "all";
  const selectedUser = userFilterEl ? userFilterEl.value : "all";
  const selectedDate = dateFilterEl ? dateFilterEl.value : "all";

  let rawActive = getActiveBookings();
  let rawHistory = getHistoryBookings();

  const isAdmin = state.currentUser && state.currentUser.role === "admin";

  // Safeguard: standard users should only view their personal bookings in active/history display tables
  if (!isAdmin) {
    rawActive = rawActive.filter(b => b.userId === state.currentUser.id);
    rawHistory = rawHistory.filter(b => b.userId === state.currentUser.id);
  }

  if (selectedVenueDetail !== "all") {
    rawActive = rawActive.filter(b => {
      const venue = state.venues.find(v => v.id === b.venueId);
      return venue && venue.details === selectedVenueDetail;
    });
    rawHistory = rawHistory.filter(b => {
      const venue = state.venues.find(v => v.id === b.venueId);
      return venue && venue.details === selectedVenueDetail;
    });
  }

  if (selectedUser !== "all") {
    rawActive = rawActive.filter(b => b.bookedBy === selectedUser);
    rawHistory = rawHistory.filter(b => b.bookedBy === selectedUser);
  }

  if (selectedDate !== "all") {
    rawActive = rawActive.filter(b => {
      if (b.rawDates) return b.rawDates.includes(selectedDate);
      return b.bookingDate === selectedDate;
    });
    rawHistory = rawHistory.filter(b => {
      if (b.rawDates) return b.rawDates.includes(selectedDate);
      return b.bookingDate === selectedDate;
    });
  }

  const activeBookings = sortActiveBookings(clubBookings(rawActive));
  const historyBookings = clubBookings(rawHistory);

  metricBookings.textContent = `${activeBookings.length}`;
  metricHistory.textContent = `${historyBookings.length}`;
  
  const thSelectAll = document.getElementById("thSelectAll");
  if (thSelectAll) {
    thSelectAll.classList.toggle("hidden", !isAdmin);
  }
  
  const selectAllCheckbox = document.getElementById("selectAllPending");
  if (selectAllCheckbox) selectAllCheckbox.checked = false;
  updateBulkActionsBar();

  activeBookingTableBody.innerHTML = activeBookings.length
    ? activeBookings
        .map((booking) => {
          const canEdit = canManageBooking(booking);
          const approveButton = isAdmin && booking.status === "pending"
            ? `<button class="primary-btn" data-action="approve" data-id="${booking.id}">Approve</button>`
            : "";
          const revertButton = isAdmin && booking.status === "approved"
            ? `<button class="secondary-btn" data-action="revert" data-id="${booking.id}">Revert</button>`
            : "";
          const editButton = booking.status === "pending"
            ? `<button class="secondary-btn" ${!canEdit ? "disabled" : ""} data-action="edit" data-id="${booking.id}">Edit</button>`
            : "";
          const cancelButton = `<button class="danger-btn" ${!canEdit ? "disabled" : ""} data-action="delete" data-id="${booking.id}">Cancel</button>`;
          
          const selectTd = isAdmin
            ? `<td class="select-col-td" style="text-align: center; vertical-align: middle;">
                ${booking.status === 'pending' ? `<input type="checkbox" class="pending-select-cb" data-id="${booking.ids.join(',')}" style="transform: scale(1.15); cursor: pointer;" />` : '—'}
               </td>`
            : "";

          return `
            <tr>
              ${selectTd}
              <td>${escapeHtml(booking.fromDate)}</td>
              <td>${escapeHtml(booking.toDate)}</td>
              <td>${escapeHtml(booking.startTime)}</td>
              <td>${escapeHtml(booking.endTime)}</td>
              <td>${escapeHtml(booking.venueName)}</td>
              <td>${escapeHtml(booking.bookedBy)}</td>
              <td>${escapeHtml(booking.purpose)}</td>
              <td>${escapeHtml(String(booking.audienceCount))}</td>
              <td>${escapeHtml(formatRequirements(booking))}</td>
              <td><span class="status-pill status-${booking.status}">${escapeHtml(booking.status)}</span></td>
              <td><div class="table-actions">${approveButton}${revertButton}${editButton}${cancelButton}</div></td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="${isAdmin ? '12' : '11'}">No bookings found.</td></tr>`;

  historyBookingTableBody.innerHTML = historyBookings.length
    ? historyBookings
        .map(
          (booking) => `
            <tr>
              <td>${escapeHtml(booking.fromDate)}</td>
              <td>${escapeHtml(booking.toDate)}</td>
              <td>${escapeHtml(booking.startTime)}</td>
              <td>${escapeHtml(booking.endTime)}</td>
              <td>${escapeHtml(booking.venueName)}</td>
              <td>${escapeHtml(booking.bookedBy)}</td>
              <td>${escapeHtml(booking.purpose)}</td>
              <td>${escapeHtml(String(booking.audienceCount))}</td>
              <td>${escapeHtml(formatRequirements(booking))}</td>
              <td><span class="status-pill status-${booking.status}">${escapeHtml(booking.status)}</span></td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="10">No booking history found.</td></tr>`;

  tableTag.textContent = isAdmin ? "All Bookings" : "My Bookings";
  tableTitle.textContent = isAdmin ? "Approval and active bookings" : "Your pending and approved bookings";
  tableMessage.textContent = isAdmin
    ? "Admins can approve pending bookings and cancel any booking."
    : "Pending bookings can be edited for 6 hours. Approved bookings are locked from editing.";
  historyMessage.textContent = "Cancelled records are shown here.";
  updateSortIndicators();
  updateVenueBusyTimes();
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
          <span>Password status: ${user.passwordResetRequired ? "Reset required on next login" : "Active"}</span><br />
          <span>Booking records: ${user.bookingCount || 0}</span><br />
          <span>Extended edit override: ${user.canEditAfter48h ? "Enabled" : "Disabled"}</span><br /><br />
          <div class="table-actions">
            <button class="secondary-btn" data-action="toggle-override" data-id="${user.id}" data-value="${user.canEditAfter48h ? "0" : "1"}">
              ${user.canEditAfter48h ? "Remove extra rights" : "Grant extra rights"}
            </button>
            <button class="secondary-btn" data-action="reset-password" data-id="${user.id}">
              Reset password
            </button>
            <button class="danger-btn" ${user.canDelete ? "" : "disabled"} data-action="delete-user" data-id="${user.id}">
              Delete user
            </button>
          </div>
        </div>
      `
    )
    .join("");
}

function resetCreateUserForm() {
  if (createUserForm) {
    createUserForm.reset();
  }
}

function resetPasswordForm() {
  passwordForm?.reset();
}

function toggleRestrictedMode() {
  const mustReset = Boolean(state.currentUser?.passwordResetRequired);
  passwordResetHint.classList.toggle("hidden", !mustReset);
  bookingSection.classList.toggle("hidden", mustReset);
  historySection.classList.toggle("hidden", mustReset);
  logSection.classList.toggle("hidden", mustReset);
  exportSection.classList.toggle("hidden", mustReset);
  if (state.currentUser?.role === "admin") {
    adminSection.classList.toggle("hidden", mustReset);
    clearLogsBtn?.classList.remove("hidden");
    adminClearBookingsBtn?.classList.remove("hidden");
  } else {
    clearLogsBtn?.classList.add("hidden");
    adminClearBookingsBtn?.classList.add("hidden");
  }
}

async function refreshData() {
  const bootstrapPayload = await api("/api/bootstrap");
  state.users = bootstrapPayload.users;
  state.venues = bootstrapPayload.venues;
  state.timeSlots = bootstrapPayload.timeSlots;
  const refreshedUser = state.users.find((user) => user.id === state.currentUser.id);
  if (refreshedUser) {
    state.currentUser = { ...state.currentUser, ...refreshedUser };
  }

  if (state.currentUser.passwordResetRequired) {
    state.bookings = [];
    state.notifications = [];
    populateBootstrap(bootstrapPayload);
    renderBookings();
    renderNotifications();
    renderAdminUsers();
    toggleRestrictedMode();
    return;
  }

  const [bookingsPayload, notificationsPayload] = await Promise.all([
    api("/api/bookings"),
    api("/api/notifications"),
  ]);

  if (state.notifications.length > 0 && notificationsPayload.notifications.length > 0) {
    const latestNew = notificationsPayload.notifications[0];
    const latestOld = state.notifications[0];
    if (latestNew.id > latestOld.id) {
      showToast(latestNew.message, "info");
    }
  }

  state.bookings = bookingsPayload.bookings;
  state.notifications = notificationsPayload.notifications;
  populateBootstrap(bootstrapPayload);
  renderBookings();
  renderNotifications();
  renderAdminUsers();
  toggleRestrictedMode();
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  welcomeText.textContent = state.currentUser.name;
  bookedByEl.value = state.currentUser.name;
  renderSelectedDates();
  renderTimeSlots();
  toggleRestrictedMode();
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
  state.selectedTimeSlots = booking.rawTimeSlots || [booking.timeSlot];
  state.selectedDates = booking.rawDates || [booking.bookingDate];
  document.getElementById("audienceCount").value = booking.audienceCount;
  setCheckedValues("avitOptions", booking.avitRequirements);
  setCheckedValues("sittingOptions", booking.sittingArrangements);
  
  bookingForm.dataset.editId = booking.id;
  bookingForm.dataset.editCode = booking.bookingCode;
  
  editModeHelperEl.classList.remove("hidden");
  editingCodeDisplayEl.textContent = booking.bookingCode;

  renderSelectedDates();
  renderTimeSlots();
  setMessage(bookingMessage, `Editing pending booking ${booking.bookingCode}. Submit to save changes.`, "success");
  
  bookingSection.scrollIntoView({ behavior: "smooth" });
}

function resetBookingForm() {
  bookingForm.reset();
  delete bookingForm.dataset.editId;
  delete bookingForm.dataset.editCode;
  
  editModeHelperEl.classList.add("hidden");
  editingCodeDisplayEl.textContent = "—";

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
  updateVenueBusyTimes();
}

function addSelectedDate() {
  const value = datePickerEl.value;
  if (!value) {
    showToast("Please choose a date first.", "error");
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

// Modification 9: Timezone-independent UTC date range calculations
function addDateRange() {
  const start = rangeStartDateEl.value;
  const end = rangeEndDateEl.value;
  if (!start || !end) {
    showToast("Please choose both start and end dates.", "error");
    return;
  }
  if (start > end) {
    showToast("End date must be after or equal to start date.", "error");
    return;
  }
  
  const [startY, startM, startD] = start.split("-").map(Number);
  const [endY, endM, endD] = end.split("-").map(Number);
  
  const cursor = new Date(Date.UTC(startY, startM - 1, startD));
  const endDate = new Date(Date.UTC(endY, endM - 1, endD));
  
  const datesToAdd = [];
  while (cursor <= endDate) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    datesToAdd.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  
  state.selectedDates = [...new Set([...state.selectedDates, ...datesToAdd])].sort();
  rangeStartDateEl.value = "";
  rangeEndDateEl.value = "";
  renderSelectedDates();
  renderTimeSlots();
  setMessage(bookingMessage, "");
}

function initPasswordToggles() {
  document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wrapper = btn.closest(".password-wrapper");
      if (!wrapper) return;
      const input = wrapper.querySelector("input");
      const eyeIcon = btn.querySelector(".eye-icon");
      const eyeOffIcon = btn.querySelector(".eye-off-icon");
      
      if (input.type === "password") {
        input.type = "text";
        eyeIcon.style.display = "none";
        eyeOffIcon.style.display = "block";
      } else {
        input.type = "password";
        eyeIcon.style.display = "block";
        eyeOffIcon.style.display = "none";
      }
    });
  });
}

async function bootstrap() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  initPasswordToggles();
  renderCheckboxGroup("avitOptions", AVIT_OPTIONS);
  renderCheckboxGroup("sittingOptions", SITTING_OPTIONS);
  const data = await api("/api/bootstrap", { headers: { "Type": "application/json" } });
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
    showToast(`Welcome back, ${state.currentUser.name}!`, "success");
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
    showToast("Please select at least one date.", "error");
    return;
  }
  if (!payload.timeSlots.length) {
    showToast("Please select at least one time slot.", "error");
    return;
  }

  try {
    if (isEdit) {
      await api(`/api/bookings/${bookingForm.dataset.editId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("Pending booking updated successfully.", "success");
    } else {
      await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Booking request submitted for approval.", "success");
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
          showToast("Remaining selections submitted for approval.", "success");
          resetBookingForm();
          await refreshData();
          return;
        } catch (retryError) {
          showToast(retryError.message, "error");
          return;
        }
      }
    }
    showToast(error.message, "error");
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

venueIdEl.addEventListener("change", () => {
  renderTimeSlots();
  updateVenueBusyTimes();
});

document.querySelectorAll("input[name='dateMode']").forEach((input) => {
  input.addEventListener("change", () => {
    state.dateMode = input.value;
    updateDateModeUi();
  });
});

document.getElementById("venueDetailFilter")?.addEventListener("change", () => renderBookings());
document.getElementById("userDetailFilter")?.addEventListener("change", () => renderBookings());
document.getElementById("dateDetailFilter")?.addEventListener("change", () => renderBookings());

editChangeDateBtn?.addEventListener("click", () => {
  state.selectedDates = [];
  renderSelectedDates();
  renderTimeSlots();
  datePickerEl.focus();
  showToast("Current dates cleared. You can now select new dates.", "info");
});

editChangeTimeBtn?.addEventListener("click", () => {
  state.selectedTimeSlots = [];
  renderTimeSlots();
  timeSlotMenuEl.classList.remove("hidden");
  showToast("Current times cleared. You can now choose new slots.", "info");
});

document.getElementById("selectAllPending")?.addEventListener("change", (event) => {
  const checked = event.target.checked;
  document.querySelectorAll(".pending-select-cb").forEach((cb) => {
    cb.checked = checked;
  });
  updateBulkActionsBar();
});

document.getElementById("approveSelectedBtn")?.addEventListener("click", async () => {
  const checkedCbs = document.querySelectorAll(".pending-select-cb:checked");
  if (!checkedCbs.length) return;
  
  const uniqueBookingIdsToApprove = [];
  const processedCodes = new Set();
  
  checkedCbs.forEach((cb) => {
    const ids = cb.dataset.id.split(",").map(Number);
    const bookingId = ids[0];
    const b = state.bookings.find(item => item.id === bookingId);
    if (b && !processedCodes.has(b.bookingCode)) {
      processedCodes.add(b.bookingCode);
      uniqueBookingIdsToApprove.push(bookingId);
    }
  });

  if (!uniqueBookingIdsToApprove.length) return;
  
  const confirmed = window.confirm(`Are you sure you want to approve the ${uniqueBookingIdsToApprove.length} selected pending block(s)?`);
  if (!confirmed) return;
  
  showToast("Processing bulk approvals...", "info");
  
  let successCount = 0;
  let failCount = 0;
  let lastError = "";

  for (const bookingId of uniqueBookingIdsToApprove) {
    try {
      const booking = state.bookings.find(item => item.id === bookingId);
      if (booking) {
        const venue = state.venues.find(v => v.id === booking.venueId);
        if (venue && venue.details === "Jamea") {
          const doubleConfirmed = window.confirm(
            `Booking Code: ${booking.bookingCode} (Booked by: ${booking.bookedBy})\n` +
            `This venue "${venue.name}" belongs to the Al Jamea group.\n\n` +
            `Is the approval taken from Al Jamea?`
          );
          if (!doubleConfirmed) {
            continue; 
          }
        }
      }
      
      await api(`/api/bookings/${bookingId}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      successCount++;
    } catch (error) {
      failCount++;
      lastError = error.message;
    }
  }
  
  if (successCount > 0) {
    showToast(`Successfully approved ${successCount} booking(s).`, "success");
  }
  if (failCount > 0) {
    showToast(`Failed to approve ${failCount} booking(s). Error: ${lastError}`, "error");
  }
  
  await refreshData();
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

document.getElementById("refreshBtn").addEventListener("click", () => {
  refreshData();
  showToast("Application data refreshed.", "info");
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {
    // Ignore logout errors
  }
  showLogin();
  resetBookingForm();
  resetCreateUserForm();
  resetPasswordForm();
  showToast("Logged out successfully.", "info");
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
      showToast(`Booking report downloaded as ${format.toUpperCase()}.`, "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
});

printReportBtn.addEventListener("click", () => {
  window.print();
});

clearLogsBtn?.addEventListener("click", async () => {
  const confirmed = window.confirm("Are you sure you want to clear all activity logs? This cannot be undone.");
  if (!confirmed) return;
  try {
    await api("/api/admin/logs", { method: "DELETE" });
    showToast("Activity logs cleared successfully.", "info");
    await refreshData();
  } catch (error) {
    showToast(error.message, "error");
  }
});

adminClearBookingsBtn?.addEventListener("click", async () => {
  const confirmed = window.confirm("CRITICAL WARNING: Are you sure you want to permanently delete ALL bookings from the database? This cannot be undone.");
  if (!confirmed) return;
  
  const password = window.prompt("To verify this dangerous action, please type your admin password:");
  if (password === null) return;
  if (!password.trim()) {
    showToast("Password cannot be blank.", "error");
    return;
  }

  try {
    await api("/api/admin/bookings/clear", { 
      method: "POST",
      body: JSON.stringify({ password })
    });
    showToast("All bookings wiped out successfully.", "info");
    await refreshData();
  } catch (error) {
    showToast(error.message, "error");
  }
});

activeBookingTableBody.addEventListener("change", (event) => {
  if (event.target.classList.contains("pending-select-cb")) {
    updateBulkActionsBar();
    const selectAllCheckbox = document.getElementById("selectAllPending");
    if (selectAllCheckbox) {
      const allCbs = document.querySelectorAll(".pending-select-cb");
      const allChecked = [...allCbs].every(cb => cb.checked);
      selectAllCheckbox.checked = allCbs.length > 0 && allChecked;
    }
  }
});

activeBookingTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const bookingId = Number(button.dataset.id);
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return;

  if (button.dataset.action === "edit") {
    const consolidatedList = clubBookings(state.bookings);
    const consolidatedBooking = consolidatedList.find(b => b.bookingCode === booking.bookingCode);
    fillBookingForm(consolidatedBooking || booking);
    return;
  }

  if (button.dataset.action === "approve") {
    if (booking) {
      const venue = state.venues.find(v => v.id === booking.venueId);
      if (venue && venue.details === "Jamea") {
        const confirmed = window.confirm(`This booking is at "${venue.name}" (Venue Group: Jamea).\n\nIs the approval taken from Al Jamea?`);
        if (!confirmed) return;
      }
    }

    try {
      await api(`/api/bookings/${bookingId}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      showToast("Booking approved successfully.", "success");
      await refreshData();
    } catch (error) {
      showToast(error.message, "error");
    }
    return;
  }

  if (button.dataset.action === "revert") {
    const confirmed = window.confirm(`Revert booking ${booking.bookingCode} back to pending status?`);
    if (!confirmed) return;
    try {
      await api(`/api/bookings/${bookingId}/revert`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      showToast("Booking reverted to pending status.", "info");
      await refreshData();
    } catch (error) {
      showToast(error.message, "error");
    }
    return;
  }

  if (button.dataset.action === "delete") {
    const confirmed = window.confirm(`Cancel booking ${booking.bookingCode}?`);
    if (!confirmed) return;
    try {
      await api(`/api/bookings/${bookingId}`, { method: "DELETE" });
      showToast("Booking cancelled successfully.", "info");
      await refreshData();
    } catch (error) {
      showToast(error.message, "error");
    }
  }
});

adminUsers.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  try {
    if (button.dataset.action === "toggle-override") {
      await api(`/api/admin/users/${button.dataset.id}/override`, {
        method: "POST",
        body: JSON.stringify({ canEditAfter48h: button.dataset.value === "1" }),
      });
      showToast("Override permission updated.", "success");
    } else if (button.dataset.action === "reset-password") {
      const temporaryPassword = window.prompt("Enter a temporary password for this user:");
      if (!temporaryPassword) return;
      await api(`/api/admin/users/${button.dataset.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ temporaryPassword }),
      });
      showToast("Temporary password set successfully.", "success");
    } else if (button.dataset.action === "delete-user") {
      const confirmed = window.confirm("Delete this unused user account?");
      if (!confirmed) return;
      await api(`/api/admin/users/${button.dataset.id}`, { method: "DELETE" });
      showToast("User account soft-deleted successfully.", "success");
    }
    await refreshData();
  } catch (error) {
    showToast(error.message, "error");
  }
});

createUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(createUserMessage, "Creating user...");
  try {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("newUserName").value,
        email: document.getElementById("newUserEmail").value,
        password: document.getElementById("newUserPassword").value,
      }),
    });
    resetCreateUserForm();
    showToast("New user account created successfully.", "success");
    setMessage(createUserMessage, "");
    await refreshData();
  } catch (error) {
    setMessage(createUserMessage, error.message, "error");
  }
});

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(passwordMessage, "Updating password...");
  try {
    const payload = await api("/api/me/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
        confirmPassword: document.getElementById("confirmPassword").value,
      }),
    });
    state.currentUser = { ...state.currentUser, ...payload.user };
    resetPasswordForm();
    showToast("Password updated successfully.", "success");
    setMessage(passwordMessage, "");
    await refreshData();
  } catch (error) {
    setMessage(passwordMessage, error.message, "error");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".slot-dropdown")) {
    timeSlotMenuEl.classList.add("hidden");
  }
});

bootstrap().catch((error) => {
  setMessage(loginMessage, error.message, "error");
});

window.addEventListener("beforeunload", (event) => {
  if (state.token) {
    event.preventDefault();
    event.returnValue = ""; 
  }
});
