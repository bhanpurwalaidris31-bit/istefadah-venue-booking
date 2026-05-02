import csv
import io
import json
import os
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "booking_app.db"
HOST = os.getenv("ISTEFADAH_HOST", "0.0.0.0" if os.getenv("PORT") else "127.0.0.1")
PORT = int(os.getenv("PORT") or os.getenv("ISTEFADAH_PORT", "8000"))

TIME_SLOTS = [
    "14:00-14:45",
    "14:45-15:30",
    "15:30-16:15",
    "16:15-17:00",
    "17:00-17:45",
    "17:45-18:30",
    "18:30-19:15",
    "19:15-20:00",
    "20:00-20:45",
    "20:45-21:30",
    "21:30-22:15",
    "22:15-23:00",
    "23:00-23:45",
]

VENUES = [
    ("Main Auditorium", 300, "Stage, projector, central audio"),
    ("Conference Hall A", 80, "Boardroom seating, TV display"),
    ("Conference Hall B", 40, "Classroom seating, screen"),
    ("Training Room", 25, "Portable projector, whiteboard"),
]

USERS = [
    ("Admin User", "admin@istefadah.org", "admin123", "admin", 1),
    ("Ali User", "ali@istefadah.org", "user123", "user", 0),
    ("Fatema User", "fatema@istefadah.org", "user123", "user", 0),
]

SESSIONS: dict[str, dict] = {}


def now_utc() -> datetime:
    return datetime.now(UTC)


def utc_iso(value: datetime | None = None) -> str:
    return (value or now_utc()).isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                can_edit_after_48h INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS venues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                capacity INTEGER NOT NULL,
                details TEXT
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_code TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                venue_id INTEGER NOT NULL,
                booking_date TEXT NOT NULL,
                time_slot TEXT NOT NULL,
                booked_by TEXT NOT NULL,
                purpose TEXT NOT NULL,
                audience_count INTEGER NOT NULL,
                audience_details TEXT,
                avit_requirements TEXT,
                sitting_arrangements TEXT,
                status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked', 'cancelled')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by_user_id INTEGER,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(venue_id) REFERENCES venues(id),
                FOREIGN KEY(updated_by_user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_booking_slot
            ON bookings (booking_date, time_slot, venue_id, status);
            """
        )

        existing_users = {row["email"] for row in conn.execute("SELECT email FROM users")}
        for user in USERS:
            if user[1] not in existing_users:
                conn.execute(
                    """
                    INSERT INTO users (name, email, password, role, can_edit_after_48h)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    user,
                )

        existing_venues = {row["name"] for row in conn.execute("SELECT name FROM venues")}
        for venue in VENUES:
            if venue[0] not in existing_venues:
                conn.execute(
                    "INSERT INTO venues (name, capacity, details) VALUES (?, ?, ?)",
                    venue,
                )
        conn.commit()


def db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def user_can_manage_booking(actor: sqlite3.Row, booking: sqlite3.Row) -> bool:
    if actor["role"] == "admin":
        return True
    if actor["id"] != booking["user_id"]:
        return False
    created_at = parse_iso(booking["created_at"])
    if now_utc() <= created_at + timedelta(hours=48):
        return True
    return bool(actor["can_edit_after_48h"])


def add_notification(conn: sqlite3.Connection, user_id: int, message: str) -> None:
    conn.execute(
        "INSERT INTO notifications (user_id, message, created_at) VALUES (?, ?, ?)",
        (user_id, message, utc_iso()),
    )


def get_admin_ids(conn: sqlite3.Connection) -> list[int]:
    return [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'admin'")]


def fetch_booking(conn: sqlite3.Connection, booking_id: int) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT b.*, v.name AS venue_name, v.capacity AS venue_capacity, u.name AS owner_name, u.email AS owner_email
        FROM bookings b
        JOIN venues v ON v.id = b.venue_id
        JOIN users u ON u.id = b.user_id
        WHERE b.id = ?
        """,
        (booking_id,),
    ).fetchone()


def serialize_booking(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "bookingCode": row["booking_code"],
        "userId": row["user_id"],
        "bookedBy": row["booked_by"],
        "ownerName": row["owner_name"],
        "ownerEmail": row["owner_email"],
        "venueId": row["venue_id"],
        "venueName": row["venue_name"],
        "venueCapacity": row["venue_capacity"],
        "bookingDate": row["booking_date"],
        "timeSlot": row["time_slot"],
        "purpose": row["purpose"],
        "audienceCount": row["audience_count"],
        "audienceDetails": row["audience_details"] or "",
        "avitRequirements": json.loads(row["avit_requirements"] or "[]"),
        "sittingArrangements": json.loads(row["sitting_arrangements"] or "[]"),
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def serialize_notification(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "createdAt": row["created_at"],
        "isRead": bool(row["is_read"]),
    }


def parse_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def generate_booking_code() -> str:
    return f"IVB-{secrets.token_hex(3).upper()}"


def find_conflicts(
    conn: sqlite3.Connection,
    venue_id: int,
    time_slot: str,
    dates: list[str],
    ignore_booking_id: int | None = None,
) -> list[dict]:
    conflicts: list[dict] = []
    for booking_date in dates:
        query = """
            SELECT b.id, b.booking_date, b.time_slot, u.name AS owner_name, v.name AS venue_name
            FROM bookings b
            JOIN users u ON u.id = b.user_id
            JOIN venues v ON v.id = b.venue_id
            WHERE b.booking_date = ?
              AND b.time_slot = ?
              AND b.venue_id = ?
              AND b.status = 'booked'
        """
        params: list = [booking_date, time_slot, venue_id]
        if ignore_booking_id is not None:
            query += " AND b.id != ?"
            params.append(ignore_booking_id)
        row = conn.execute(query, params).fetchone()
        if row:
            conflicts.append(
                {
                    "date": row["booking_date"],
                    "timeSlot": row["time_slot"],
                    "venueName": row["venue_name"],
                    "bookedBy": row["owner_name"],
                    "message": (
                        f"{row['booking_date']} {row['time_slot']} at {row['venue_name']} "
                        f"is already booked by {row['owner_name']}."
                    ),
                }
            )
    return conflicts


def collect_slot_conflicts(
    conn: sqlite3.Connection,
    venue_id: int,
    time_slots: list[str],
    dates: list[str],
    ignore_booking_id: int | None = None,
) -> list[dict]:
    conflicts: list[dict] = []
    for time_slot in time_slots:
        conflicts.extend(find_conflicts(conn, venue_id, time_slot, dates, ignore_booking_id))
    return conflicts


def fetch_bookings(conn: sqlite3.Connection, user: sqlite3.Row | None = None) -> list[dict]:
    query = """
        SELECT b.*, v.name AS venue_name, v.capacity AS venue_capacity, u.name AS owner_name, u.email AS owner_email
        FROM bookings b
        JOIN venues v ON v.id = b.venue_id
        JOIN users u ON u.id = b.user_id
    """
    params: list = []
    if user and user["role"] != "admin":
        query += " WHERE b.user_id = ?"
        params.append(user["id"])
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC, b.id DESC"
    return [serialize_booking(row) for row in conn.execute(query, params)]


def render_office_table(bookings: list[dict], title: str) -> str:
    header = """
    <tr>
      <th>Booking Code</th>
      <th>Date</th>
      <th>Time Slot</th>
      <th>Venue</th>
      <th>Booked By</th>
      <th>Purpose</th>
      <th>Audience</th>
      <th>Status</th>
    </tr>
    """
    rows = []
    for booking in bookings:
        rows.append(
            f"""
            <tr>
              <td>{booking['bookingCode']}</td>
              <td>{booking['bookingDate']}</td>
              <td>{booking['timeSlot']}</td>
              <td>{booking['venueName']}</td>
              <td>{booking['bookedBy']}</td>
              <td>{booking['purpose']}</td>
              <td>{booking['audienceCount']}</td>
              <td>{booking['status']}</td>
            </tr>
            """
        )
    return f"""
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {{ font-family: Calibri, Arial, sans-serif; padding: 24px; }}
          h1 {{ color: #123c37; }}
          table {{ border-collapse: collapse; width: 100%; }}
          th, td {{ border: 1px solid #93ada8; padding: 8px; text-align: left; }}
          th {{ background: #dff0eb; }}
        </style>
      </head>
      <body>
        <h1>{title}</h1>
        <table>{header}{''.join(rows)}</table>
      </body>
    </html>
    """


class AppHandler(BaseHTTPRequestHandler):
    server_version = "IstefadahBooking/1.0"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.serve_static("index.html", "text/html; charset=utf-8")
            return
        if parsed.path.startswith("/static/"):
            filename = parsed.path.replace("/static/", "", 1)
            content_type = "text/plain; charset=utf-8"
            if filename.endswith(".css"):
                content_type = "text/css; charset=utf-8"
            elif filename.endswith(".js"):
                content_type = "application/javascript; charset=utf-8"
            self.serve_static(filename, content_type)
            return
        if parsed.path == "/api/bootstrap":
            self.handle_bootstrap()
            return
        if parsed.path == "/api/bookings":
            self.handle_get_bookings()
            return
        if parsed.path == "/api/notifications":
            self.handle_get_notifications()
            return
        if parsed.path == "/api/export":
            self.handle_export(parsed.query)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/login":
            self.handle_login()
            return
        if parsed.path == "/api/logout":
            self.handle_logout()
            return
        if parsed.path == "/api/bookings":
            self.handle_create_bookings()
            return
        if parsed.path.startswith("/api/admin/users/") and parsed.path.endswith("/override"):
            self.handle_toggle_override(parsed.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/bookings/"):
            self.handle_update_booking(parsed.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/bookings/"):
            self.handle_delete_booking(parsed.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def serve_static(self, filename: str, content_type: str) -> None:
        target = STATIC_DIR / filename
        if not target.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Static file not found")
            return
        content = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def json_response(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def require_auth(self) -> sqlite3.Row | None:
        token = self.headers.get("X-Session-Token", "")
        session = SESSIONS.get(token)
        if not session:
            self.json_response({"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
            return None
        with db_connection() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],)).fetchone()
        if not user:
            self.json_response({"error": "Session user not found."}, HTTPStatus.UNAUTHORIZED)
            return None
        return user

    def handle_bootstrap(self) -> None:
        with db_connection() as conn:
            venues = [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "capacity": row["capacity"],
                    "details": row["details"],
                }
                for row in conn.execute("SELECT * FROM venues ORDER BY capacity DESC, name ASC")
            ]
            users = [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "role": row["role"],
                    "canEditAfter48h": bool(row["can_edit_after_48h"]),
                }
                for row in conn.execute("SELECT id, name, email, role, can_edit_after_48h FROM users ORDER BY role DESC, name ASC")
            ]
        self.json_response(
            {
                "appName": "Istefadah Venue Booking",
                "timeSlots": TIME_SLOTS,
                "venues": venues,
                "users": users,
                "demoCredentials": [
                    {"role": "Admin", "email": "admin@istefadah.org", "password": "admin123"},
                    {"role": "User", "email": "ali@istefadah.org", "password": "user123"},
                    {"role": "User", "email": "fatema@istefadah.org", "password": "user123"},
                ],
            }
        )

    def handle_login(self) -> None:
        payload = parse_body(self)
        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "").strip()
        with db_connection() as conn:
            user = conn.execute(
                "SELECT id, name, email, role, can_edit_after_48h FROM users WHERE email = ? AND password = ?",
                (email, password),
            ).fetchone()
        if not user:
            self.json_response({"error": "Invalid email or password."}, HTTPStatus.UNAUTHORIZED)
            return
        token = secrets.token_urlsafe(24)
        SESSIONS[token] = {"user_id": user["id"], "created_at": utc_iso()}
        self.json_response(
            {
                "token": token,
                "user": {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"],
                    "role": user["role"],
                    "canEditAfter48h": bool(user["can_edit_after_48h"]),
                },
            }
        )

    def handle_logout(self) -> None:
        token = self.headers.get("X-Session-Token", "")
        SESSIONS.pop(token, None)
        self.json_response({"success": True})

    def handle_get_bookings(self) -> None:
        user = self.require_auth()
        if not user:
            return
        with db_connection() as conn:
            self.json_response({"bookings": fetch_bookings(conn, user)})

    def handle_get_notifications(self) -> None:
        user = self.require_auth()
        if not user:
            return
        with db_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
                (user["id"],),
            ).fetchall()
        self.json_response({"notifications": [serialize_notification(row) for row in rows]})

    def handle_create_bookings(self) -> None:
        user = self.require_auth()
        if not user:
            return

        payload = parse_body(self)
        dates = sorted(set(payload.get("dates", [])))
        raw_time_slots = payload.get("timeSlots")
        if isinstance(raw_time_slots, list):
            time_slots = sorted({str(item).strip() for item in raw_time_slots if str(item).strip()})
        else:
            fallback_time_slot = payload.get("timeSlot", "").strip()
            time_slots = [fallback_time_slot] if fallback_time_slot else []
        venue_id = int(payload.get("venueId", 0))
        purpose = payload.get("purpose", "").strip()
        booked_by = payload.get("bookedBy", "").strip() or user["name"]
        audience_count = int(payload.get("audienceCount", 0))
        audience_details = payload.get("audienceDetails", "").strip()
        avit_requirements = payload.get("avitRequirements", [])
        sitting_arrangements = payload.get("sittingArrangements", [])
        allow_partial = bool(payload.get("allowPartial", False))

        if not dates:
            self.json_response({"error": "Please select at least one date."}, HTTPStatus.BAD_REQUEST)
            return
        if not time_slots:
            self.json_response({"error": "Please select at least one time slot."}, HTTPStatus.BAD_REQUEST)
            return
        if any(time_slot not in TIME_SLOTS for time_slot in time_slots):
            self.json_response({"error": "Invalid time slot selection."}, HTTPStatus.BAD_REQUEST)
            return
        if not purpose:
            self.json_response({"error": "Purpose is required."}, HTTPStatus.BAD_REQUEST)
            return

        with db_connection() as conn:
            venue = conn.execute("SELECT * FROM venues WHERE id = ?", (venue_id,)).fetchone()
            if not venue:
                self.json_response({"error": "Venue not found."}, HTTPStatus.BAD_REQUEST)
                return
            if audience_count <= 0:
                self.json_response({"error": "Audience count must be greater than zero."}, HTTPStatus.BAD_REQUEST)
                return
            if audience_count > venue["capacity"]:
                self.json_response(
                    {
                        "error": (
                            f"Audience count {audience_count} exceeds venue capacity "
                            f"{venue['capacity']} for {venue['name']}."
                        )
                    },
                    HTTPStatus.BAD_REQUEST,
                )
                return

            conflicts = collect_slot_conflicts(conn, venue_id, time_slots, dates)
            if conflicts and not allow_partial:
                blocked_pairs = {(item["date"], item["timeSlot"]) for item in conflicts}
                available_pairs = [
                    {"date": booking_date, "timeSlot": time_slot}
                    for booking_date in dates
                    for time_slot in time_slots
                    if (booking_date, time_slot) not in blocked_pairs
                ]
                self.json_response(
                    {
                        "error": "One or more selected slot/date combinations are already booked.",
                        "conflicts": conflicts,
                        "availableSelections": available_pairs,
                        "prompt": (
                            "Some selected slot/date combinations are already booked. Do you want to book the remaining available selections?"
                        ),
                    },
                    HTTPStatus.CONFLICT,
                )
                return

            blocked_pairs = {(item["date"], item["timeSlot"]) for item in conflicts}
            final_pairs = [
                (booking_date, time_slot)
                for booking_date in dates
                for time_slot in time_slots
                if (booking_date, time_slot) not in blocked_pairs
            ]
            if not final_pairs:
                self.json_response(
                    {"error": "No slot/date combinations remain available for booking after conflict checks."},
                    HTTPStatus.CONFLICT,
                )
                return

            created_ids: list[int] = []
            for booking_date, time_slot in final_pairs:
                cursor = conn.execute(
                    """
                    INSERT INTO bookings (
                        booking_code, user_id, venue_id, booking_date, time_slot, booked_by,
                        purpose, audience_count, audience_details, avit_requirements,
                        sitting_arrangements, created_at, updated_at, updated_by_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        generate_booking_code(),
                        user["id"],
                        venue_id,
                        booking_date,
                        time_slot,
                        booked_by,
                        purpose,
                        audience_count,
                        audience_details,
                        json.dumps(avit_requirements),
                        json.dumps(sitting_arrangements),
                        utc_iso(),
                        utc_iso(),
                        user["id"],
                    ),
                )
                created_ids.append(cursor.lastrowid)

            for booking_id in created_ids:
                booking = fetch_booking(conn, booking_id)
                if booking:
                    add_notification(
                        conn,
                        user["id"],
                        f"Booking confirmed for {booking['booking_date']} {booking['time_slot']} at {booking['venue_name']}.",
                    )
                    for admin_id in get_admin_ids(conn):
                        add_notification(
                            conn,
                            admin_id,
                            f"New booking by {booking['booked_by']} for {booking['booking_date']} {booking['time_slot']} at {booking['venue_name']}.",
                        )
            conn.commit()
            created = [serialize_booking(fetch_booking(conn, booking_id)) for booking_id in created_ids]
        self.json_response(
            {
                "message": f"Booked successfully for {len(created)} slot/date selection(s).",
                "created": created,
                "skippedConflicts": conflicts,
            },
            HTTPStatus.CREATED,
        )

    def handle_update_booking(self, path: str) -> None:
        user = self.require_auth()
        if not user:
            return
        booking_id = int(path.rsplit("/", 1)[-1])
        payload = parse_body(self)

        with db_connection() as conn:
            booking = fetch_booking(conn, booking_id)
            if not booking:
                self.json_response({"error": "Booking not found."}, HTTPStatus.NOT_FOUND)
                return
            if not user_can_manage_booking(user, booking):
                self.json_response(
                    {"error": "You cannot edit this booking after 48 hours unless admin grants rights."},
                    HTTPStatus.FORBIDDEN,
                )
                return

            new_venue_id = int(payload.get("venueId", booking["venue_id"]))
            new_date = payload.get("bookingDate", booking["booking_date"]).strip()
            new_time_slot = payload.get("timeSlot", booking["time_slot"]).strip()
            new_purpose = payload.get("purpose", booking["purpose"]).strip()
            new_audience_count = int(payload.get("audienceCount", booking["audience_count"]))
            new_audience_details = payload.get("audienceDetails", booking["audience_details"] or "").strip()
            new_avit = payload.get("avitRequirements", json.loads(booking["avit_requirements"] or "[]"))
            new_sitting = payload.get("sittingArrangements", json.loads(booking["sitting_arrangements"] or "[]"))
            new_booked_by = payload.get("bookedBy", booking["booked_by"]).strip()

            venue = conn.execute("SELECT * FROM venues WHERE id = ?", (new_venue_id,)).fetchone()
            if not venue:
                self.json_response({"error": "Venue not found."}, HTTPStatus.BAD_REQUEST)
                return
            if new_audience_count > venue["capacity"]:
                self.json_response(
                    {
                        "error": (
                            f"Audience count {new_audience_count} exceeds venue capacity "
                            f"{venue['capacity']} for {venue['name']}."
                        )
                    },
                    HTTPStatus.BAD_REQUEST,
                )
                return
            conflicts = find_conflicts(conn, new_venue_id, new_time_slot, [new_date], ignore_booking_id=booking_id)
            if conflicts:
                self.json_response({"error": conflicts[0]["message"]}, HTTPStatus.CONFLICT)
                return

            conn.execute(
                """
                UPDATE bookings
                SET venue_id = ?, booking_date = ?, time_slot = ?, booked_by = ?, purpose = ?,
                    audience_count = ?, audience_details = ?, avit_requirements = ?,
                    sitting_arrangements = ?, updated_at = ?, updated_by_user_id = ?
                WHERE id = ?
                """,
                (
                    new_venue_id,
                    new_date,
                    new_time_slot,
                    new_booked_by,
                    new_purpose,
                    new_audience_count,
                    new_audience_details,
                    json.dumps(new_avit),
                    json.dumps(new_sitting),
                    utc_iso(),
                    user["id"],
                    booking_id,
                ),
            )
            refreshed = fetch_booking(conn, booking_id)
            add_notification(
                conn,
                booking["user_id"],
                f"Booking {booking['booking_code']} was updated by {user['name']}.",
            )
            for admin_id in get_admin_ids(conn):
                if admin_id != user["id"]:
                    add_notification(
                        conn,
                        admin_id,
                        f"Booking {booking['booking_code']} was updated by {user['name']}.",
                    )
            conn.commit()
        self.json_response({"message": "Booking updated successfully.", "booking": serialize_booking(refreshed)})

    def handle_delete_booking(self, path: str) -> None:
        user = self.require_auth()
        if not user:
            return
        booking_id = int(path.rsplit("/", 1)[-1])
        with db_connection() as conn:
            booking = fetch_booking(conn, booking_id)
            if not booking:
                self.json_response({"error": "Booking not found."}, HTTPStatus.NOT_FOUND)
                return
            if not user_can_manage_booking(user, booking):
                self.json_response(
                    {"error": "You cannot cancel this booking after 48 hours unless admin grants rights."},
                    HTTPStatus.FORBIDDEN,
                )
                return
            conn.execute(
                "UPDATE bookings SET status = 'cancelled', updated_at = ?, updated_by_user_id = ? WHERE id = ?",
                (utc_iso(), user["id"], booking_id),
            )
            add_notification(
                conn,
                booking["user_id"],
                f"Booking {booking['booking_code']} was cancelled by {user['name']}.",
            )
            for admin_id in get_admin_ids(conn):
                if admin_id != user["id"]:
                    add_notification(
                        conn,
                        admin_id,
                        f"Booking {booking['booking_code']} was cancelled by {user['name']}.",
                    )
            conn.commit()
        self.json_response({"message": "Booking cancelled successfully."})

    def handle_toggle_override(self, path: str) -> None:
        user = self.require_auth()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return
        user_id = int(path.split("/")[4])
        payload = parse_body(self)
        can_edit = 1 if payload.get("canEditAfter48h") else 0
        with db_connection() as conn:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if not target:
                self.json_response({"error": "User not found."}, HTTPStatus.NOT_FOUND)
                return
            conn.execute(
                "UPDATE users SET can_edit_after_48h = ? WHERE id = ?",
                (can_edit, user_id),
            )
            add_notification(
                conn,
                user_id,
                f"Admin {'granted' if can_edit else 'removed'} post-48-hour edit/delete rights.",
            )
            conn.commit()
        self.json_response({"message": "Override updated successfully."})

    def handle_export(self, query: str) -> None:
        user = self.require_auth()
        if not user:
            return
        params = parse_qs(query)
        export_format = params.get("format", ["excel"])[0]
        with db_connection() as conn:
            bookings = fetch_bookings(conn, user)

        if export_format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["Booking Code", "Date", "Time Slot", "Venue", "Booked By", "Purpose", "Audience", "Status"])
            for booking in bookings:
                writer.writerow(
                    [
                        booking["bookingCode"],
                        booking["bookingDate"],
                        booking["timeSlot"],
                        booking["venueName"],
                        booking["bookedBy"],
                        booking["purpose"],
                        booking["audienceCount"],
                        booking["status"],
                    ]
                )
            data = output.getvalue().encode("utf-8")
            filename = "istefadah-bookings.csv"
            content_type = "text/csv; charset=utf-8"
        elif export_format == "word":
            data = render_office_table(bookings, "Istefadah Venue Bookings").encode("utf-8")
            filename = "istefadah-bookings.doc"
            content_type = "application/msword"
        else:
            data = render_office_table(bookings, "Istefadah Venue Bookings").encode("utf-8")
            filename = "istefadah-bookings.xls"
            content_type = "application/vnd.ms-excel"

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    init_db()
    try:
        server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    except OSError as exc:
        print(
            f"Could not start server on http://{HOST}:{PORT}. "
            f"Reason: {exc}. Try a different port with "
            f"`set ISTEFADAH_PORT=8001` and run again.",
            flush=True,
        )
        raise SystemExit(1) from exc

    print(f"Istefadah Venue Booking running at http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
