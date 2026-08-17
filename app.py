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
import urllib.request
import urllib.error

import psycopg2
import psycopg2.extras

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
VENUE_SEED_PATH = BASE_DIR / "venue_seed.json"
HOST = os.getenv("ISTEFADAH_HOST", "0.0.0.0" if os.getenv("PORT") else "127.0.0.1")
PORT = int(os.getenv("PORT") or os.getenv("ISTEFADAH_PORT", "8000"))

TIME_SLOTS = [
    "08:00-08:30", "08:30-09:00", "09:00-09:30", "09:30-10:00",
    "10:00-10:30", "10:30-11:00", "11:00-11:30", "11:30-12:00",
    "12:00-12:30", "12:30-13:00", "13:00-13:30", "13:30-14:00",
    "14:00-14:30", "14:30-15:00", "15:00-15:30", "15:30-16:00",
    "16:00-16:30", "16:30-17:00", "17:00-17:30", "17:30-18:00",
    "18:00-18:30", "18:30-19:00", "19:00-19:30", "19:30-20:00",
    "20:00-20:30", "20:30-21:00", "21:00-21:30", "21:30-22:00",
    "22:00-22:30", "22:30-23:00"
]

FALLBACK_VENUES = [
    ("Rabvat jiblah", 250, "Jamea"),
    ("Faiz e Saiffee 1st floor", 300, "Qubba Mubaraka"),
    ("Faiz e Saiffee 2nd floor", 300, "Qubba Mubaraka"),
    ("Qadri hall", 400, "Begampura"),
    ("Madrasah Taiyebyah 1st basement", 500, "Begampura"),
    ("Faiz e Saiffee 3rd floor", 300, "Qubba Mubaraka"),
    ("Fatemi Masjid Niswan", 400, "Jamea"),
    ("Auditorium", 500, "Jamea"),
    ("Audi Foyer", 250, "Jamea"),
    ("Evan ul Barakaat", 1000, "Jamea"),
    ("Fatemi Masjid", 500, "Jamea"),
    ("Qism u Nawaderaat", 200, "Jamea"),
    ("Mahad uz Zahra Qa'at", 250, "Jamea"),
    ("Gurfa Mubaraka", 50, "Jamea"),
    ("Tabiq 4", 700, "Jamea"),
    ("Tabiq 5", 500, "Jamea"),
    ("Khaimat ur riyadat Marquee 1", 1500, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 2", 1500, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 3", 700, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 4", 700, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 5", 700, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 6", 700, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 7", 1400, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 8", 800, "Khaimat ur riyazat"),
    ("Khaimat ur riyadat Marquee 9", 800, "Khaimat ur riyazat"),
    ("Hadiaqat e Mufaddal Gr flr hall 1", 1000, "Begumwadi"),
    ("Hadiaqat e Mufaddal Gr flr hall 2", 1000, "Begumwadi"),
    ("Hadiaqat e Mufaddal first flr hall 1", 1000, "Begumwadi"),
    ("Hadiaqat e Mufaddal first flr hall 2", 1000, "Begumwadi"),
    ("Hadiaqat e Mufaddal second flr hall 1", 1000, "Begumwadi"),
    ("Hadiaqat e Mufaddal second flr hall 2", 1000, "Begumwadi"),
    ("Hadiaqat e Mufaddal third flr hall", 1000, "Begumwadi"),
    ("Husaina Hall, Husaini Manzil", 250, "Bilal Gali"),
    ("Masjid e Moazzam", 1500, "Masjid e Moazzam"),
    ("Class Room 413", 50, "Jamea"),
    ("Najmi Masjid", 1000, "Begampura"),
]

USERS = [
    ("Admin User", "admin@istefadah.org", "admin123", "admin", 1),
    ("Ali User", "ali@istefadah.org", "user123", "user", 0),
    ("Fatema User", "fatema@istefadah.org", "user123", "user", 0),
]

SESSIONS: dict[str, dict] = {}

def load_seed_venues() -> list[tuple[str, int, str]]:
    if not VENUE_SEED_PATH.exists():
        return FALLBACK_VENUES
    try:
        rows = json.loads(VENUE_SEED_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return FALLBACK_VENUES

    venues: list[tuple[str, int, str]] = []
    for row in rows:
        name = str(row.get("name", "")).strip()
        details = str(row.get("details", "")).strip()
        try:
            capacity = int(row.get("capacity", 0))
        except (TypeError, ValueError):
            capacity = 0
        if name and capacity > 0:
            venues.append((name, capacity, details))
    return venues or FALLBACK_VENUES

VENUES = load_seed_venues()

def now_utc() -> datetime:
    return datetime.now(UTC)

def utc_iso(value: datetime | None = None) -> str:
    return (value or now_utc()).isoformat()

def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)

class PostgresConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        sql = sql.replace("?", "%s")
        cur = self.conn.conn.cursor() if hasattr(self.conn, "conn") else self.conn.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()
        self.close()

def db_connection() -> PostgresConnectionWrapper:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL environment variable is missing! Please configure it in your Render settings.")
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    raw_conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.DictCursor)
    return PostgresConnectionWrapper(raw_conn)

def init_db() -> None:
    with db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'user')),
                can_edit_after_48h INTEGER NOT NULL DEFAULT 0,
                password_reset_required INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                is_deleted INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS venues (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                capacity INTEGER NOT NULL,
                details TEXT,
                is_active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                booking_code VARCHAR(100) NOT NULL,
                user_id INTEGER NOT NULL,
                venue_id INTEGER NOT NULL,
                booking_date VARCHAR(100) NOT NULL,
                time_slot VARCHAR(100) NOT NULL,
                booked_by VARCHAR(255) NOT NULL,
                purpose VARCHAR(255) NOT NULL,
                audience_count INTEGER NOT NULL,
                audience_details TEXT,
                avit_requirements TEXT,
                sitting_arrangements TEXT,
                status VARCHAR(100) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'completed', 'cancelled')),
                created_at VARCHAR(100) NOT NULL,
                updated_at VARCHAR(100) NOT NULL,
                updated_by_user_id INTEGER,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(venue_id) REFERENCES venues(id),
                FOREIGN KEY(updated_by_user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                created_at VARCHAR(100) NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_booking_slot
            ON bookings (booking_date, time_slot, venue_id, status);
            """
        )

        for user in USERS:
            exists = conn.execute(
                "SELECT id FROM users WHERE email = %s OR email LIKE %s",
                (user[1], f"deleted-%-{user[1]}"),
            ).fetchone()

            if not exists:
                conn.execute(
                    """
                    INSERT INTO users (name, email, password, role, can_edit_after_48h)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    user,
                )

        existing_venues = {
            row["name"]: row["id"] for row in conn.execute("SELECT id, name FROM venues")
        }
        for venue in VENUES:
            if venue[0] not in existing_venues:
                conn.execute(
                    "INSERT INTO venues (name, capacity, details, is_active) VALUES (%s, %s, %s, 1)",
                    venue,
                )
            else:
                conn.execute(
                    """
                    UPDATE venues
                    SET capacity = %s, details = %s, is_active = 1
                    WHERE name = %s
                    """,
                    (venue[1], venue[2], venue[0]),
                )

        if VENUES:
            placeholders = ", ".join("%s" for _ in VENUES)
            conn.execute(
                f"UPDATE venues SET is_active = 0 WHERE name NOT IN ({placeholders})",
                [venue[0] for venue in VENUES],
            )

def update_completed_bookings(conn: PostgresConnectionWrapper) -> None:
    now = datetime.now()
    try:
        rows = conn.execute(
            """
            SELECT id, booking_code, booking_date, time_slot, status
            FROM bookings
            WHERE status IN ('approved', 'pending')
            """
        ).fetchall()

        for row in rows:
            try:
                booking_date = datetime.strptime(row["booking_date"], "%Y-%m-%d").date()
                end_time = row["time_slot"].split("-")[1].strip()
                booking_end = datetime.strptime(f"{booking_date} {end_time}", "%Y-%m-%d %H:%M")

                if booking_end <= now:
                    conn.execute(
                        """
                        UPDATE bookings
                        SET status = 'completed', updated_at = %s
                        WHERE id = %s
                        """,
                        (utc_iso(), row["id"]),
                    )
            except Exception:
                continue
        conn.commit()
    except Exception:
        pass

def merge_dates_py(dates_list: list[str]) -> str:
    if not dates_list:
        return ""
    sorted_dates = sorted(list(set(dates_list)))
    ranges = []
    temp_range = []
    
    for d_str in sorted_dates:
        d = datetime.strptime(d_str, "%Y-%m-%d").date()
        if not temp_range:
            temp_range.append(d)
        else:
            if d == temp_range[-1] + timedelta(days=1):
                temp_range.append(d)
            else:
                if len(temp_range) == 1:
                    ranges.append(temp_range[0].strftime("%Y-%m-%d"))
                else:
                    ranges.append(f"{temp_range[0].strftime('%Y-%m-%d')} to {temp_range[-1].strftime('%Y-%m-%d')}")
                temp_range = [d]
    if temp_range:
        if len(temp_range) == 1:
            ranges.append(temp_range[0].strftime("%Y-%m-%d"))
        else:
            ranges.append(f"{temp_range[0].strftime('%Y-%m-%d')} to {temp_range[-1].strftime('%Y-%m-%d')}")
    return ", ".join(ranges)

def merge_slots_py(slots_list: list[str]) -> str:
    if not slots_list:
        return ""
    sorted_slots = sorted(list(set(slots_list)), key=lambda x: x.split("-")[0])
    merged = []
    current_start = None
    current_end = None
    for slot in sorted_slots:
        parts = slot.split("-")
        if len(parts) != 2:
            continue
        start, end = parts[0], parts[1]
        if current_start is None:
            current_start = start
            current_end = end
        elif start == current_end:
            current_end = end
        else:
            merged.append(f"{current_start}-{current_end}")
            current_start = start
            current_end = end
    if current_start is not None:
        merged.append(f"{current_start}-{current_end}")
    return ", ".join(merged)

def get_clubbed_booking_payload(conn: PostgresConnectionWrapper, booking_code: str) -> dict:
    rows = conn.execute(
        """
        SELECT b.*, v.name AS venue_name, v.capacity AS venue_capacity, u.name AS owner_name, u.email AS owner_email
        FROM bookings b
        JOIN venues v ON v.id = b.venue_id
        JOIN users u ON u.id = b.user_id
        WHERE b.booking_code = %s
        """,
        (booking_code,)
    ).fetchall()
    if not rows:
        return {}
    
    dates = [r["booking_date"] for r in rows]
    slots = [r["time_slot"] for r in rows]
    
    merged_dates = merge_dates_py(dates)
    merged_slots = merge_slots_py(slots)
    ref = rows[0]
    
    return {
        "bookingCode": ref["booking_code"],
        "bookingDate": merged_dates,
        "timeSlot": merged_slots,
        "venueName": ref["venue_name"],
        "bookedBy": ref["booked_by"],
        "purpose": ref["purpose"],
        "audienceCount": ref["audience_count"],
        "status": ref["status"],
        "createdAt": ref["created_at"]
    }

def sync_to_google_sheet_by_code(conn: PostgresConnectionWrapper, booking_code: str) -> None:
    webhook_url = os.getenv("GOOGLE_SHEET_WEBHOOK")
    if not webhook_url:
        return
    payload = get_clubbed_booking_payload(conn, booking_code)
    if not payload:
        return
    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            res_body = response.read().decode("utf-8")
            print(f"[DEBUG] Google Sheet sync response: {res_body}", flush=True)
    except Exception as e:
        print(f"[DEBUG] Google Sheet sync failed: {e}", flush=True)

def user_can_manage_booking(actor: dict, booking: dict) -> bool:
    if actor["role"] == "admin":
        return True
    if actor["id"] != booking["user_id"]:
        return False
    if booking["status"] == "approved":
        return False
    created_at = parse_iso(booking["created_at"])
    if now_utc() <= created_at + timedelta(hours=6):
        return True
    return bool(actor["can_edit_after_48h"])

def add_notification(conn: PostgresConnectionWrapper, user_id: int, message: str) -> None:
    conn.execute(
        "INSERT INTO notifications (user_id, message, created_at) VALUES (%s, %s, %s)",
        (user_id, message, utc_iso()),
    )

def get_admin_ids(conn: PostgresConnectionWrapper) -> list[int]:
    return [row["id"] for row in conn.execute("SELECT id FROM users WHERE role = 'admin'")]

def serialize_user(row: dict, booking_count: int = 0, active_booking_count: int = 0) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "canEditAfter48h": bool(row["can_edit_after_48h"]),
        "passwordResetRequired": bool(row["password_reset_required"]),
        "isActive": bool(row["is_active"]),
        "isDeleted": bool(row["is_deleted"]),
        "bookingCount": booking_count,
        "activeBookingCount": active_booking_count,
        "canDelete": row["role"] != "admin" and active_booking_count == 0,
        "canToggleActive": row["role"] != "admin" and not bool(row["is_deleted"]),
    }

def user_must_reset_password(user: dict) -> bool:
    return bool(user["password_reset_required"])

def fetch_booking(conn: PostgresConnectionWrapper, booking_id: int) -> dict | None:
    update_completed_bookings(conn)
    return conn.execute(
        """
        SELECT b.*, v.name AS venue_name, v.capacity AS venue_capacity, u.name AS owner_name, u.email AS owner_email
        FROM bookings b
        JOIN venues v ON v.id = b.venue_id
        JOIN users u ON u.id = b.user_id
        WHERE b.id = %s
        """,
        (booking_id,),
    ).fetchone()

def serialize_booking(row: dict) -> dict:
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

def serialize_notification(row: dict) -> dict:
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
    conn: PostgresConnectionWrapper,
    venue_id: int,
    time_slot: str,
    dates: list[str],
    ignore_booking_id: int | None = None,
    ignore_booking_code: str | None = None,
) -> list[dict]:
    update_completed_bookings(conn)
    conflicts: list[dict] = []
    for booking_date in dates:
        query = """
            SELECT b.id, b.booking_date, b.time_slot, u.name AS owner_name, v.name AS venue_name
            FROM bookings b
            JOIN users u ON u.id = b.user_id
            JOIN venues v ON v.id = b.venue_id
            WHERE b.booking_date = %s
              AND b.time_slot = %s
              AND b.venue_id = %s
              AND b.status IN ('pending', 'approved')
        """
        params: list = [booking_date, time_slot, venue_id]
        if ignore_booking_id is not None:
            query += " AND b.id != %s"
            params.append(ignore_booking_id)
        if ignore_booking_code is not None:
            query += " AND b.booking_code != %s"
            params.append(ignore_booking_code)
            
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
    conn: PostgresConnectionWrapper,
    venue_id: int,
    time_slots: list[str],
    dates: list[str],
    ignore_booking_id: int | None = None,
    ignore_booking_code: str | None = None,
) -> list[dict]:
    conflicts: list[dict] = []
    for time_slot in time_slots:
        conflicts.extend(find_conflicts(conn, venue_id, time_slot, dates, ignore_booking_id, ignore_booking_code))
    return conflicts

# Modification 10: Fetch all globally (non-admin limits removed here; privacy scrubbing happens at handler-level)
def fetch_bookings(conn: PostgresConnectionWrapper, user: dict | None = None) -> list[dict]:
    update_completed_bookings(conn)
    query = """
        SELECT b.*, v.name AS venue_name, v.capacity AS venue_capacity, u.name AS owner_name, u.email AS owner_email
        FROM bookings b
        JOIN venues v ON v.id = b.venue_id
        JOIN users u ON u.id = b.user_id
    """
    params: list = []
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC, b.id DESC"
    return [serialize_booking(row) for row in conn.execute(query, params)]

def club_bookings_py(bookings_list: list[dict]) -> list[dict]:
    groups = {}
    for b in bookings_list:
        code = b["bookingCode"]
        if code not in groups:
            groups[code] = []
        groups[code].append(b)
    
    result = []
    for code, items in groups.items():
        dates = sorted(list(set(b["bookingDate"] for b in items)))
        blocks = []
        current_block = []
        for d_str in dates:
            d = datetime.strptime(d_str, "%Y-%m-%d").date()
            if not current_block:
                current_block.append(d)
            else:
                if d == current_block[-1] + timedelta(days=1):
                    current_block.append(d)
                else:
                    blocks.append(current_block)
                    current_block = [d]
        if current_block:
            blocks.append(current_block)
        
        for block in blocks:
            block_strs = [d.strftime("%Y-%m-%d") for d in block]
            block_items = [item for item in items if item["bookingDate"] in block_strs]
            
            slots = sorted(list(set(item["timeSlot"] for item in block_items)), key=lambda x: x.split("-")[0])
            start_times = [s.split("-")[0] for s in slots if "-" in s]
            end_times = [s.split("-")[1] for s in slots if "-" in s]
            
            start_time = start_times[0] if start_times else "—"
            end_time = end_times[-1] if end_times else "—"
            ref = block_items[0]
            
            result.append({
                "bookingCode": ref["bookingCode"],
                "fromDate": block_strs[0],
                "toDate": block_strs[-1],
                "startTime": start_time,
                "endTime": end_time,
                "venueName": ref["venueName"],
                "bookedBy": ref["bookedBy"],
                "purpose": ref["purpose"],
                "audienceCount": ref["audienceCount"],
                "avitRequirements": ref["avitRequirements"],
                "sittingArrangements": ref["sittingArrangements"],
                "status": ref["status"],
            })
    return result

def render_office_table(bookings: list[dict], title: str) -> str:
    clubbed = club_bookings_py(bookings)
    active_bookings = [b for b in clubbed if b["status"] in ("pending", "approved")]
    history_bookings = [b for b in clubbed if b["status"] in ("completed", "cancelled")]

    def make_rows(items: list[dict]) -> str:
        if not items:
            return "<tr><td colspan='11'>No bookings found.</td></tr>"
        rows = []
        for booking in items:
            avit = booking.get("avitRequirements", [])
            sitting = booking.get("sittingArrangements", [])
            req_parts = []
            if avit:
                req_parts.append(f"AVIT: {', '.join(avit)}")
            if sitting:
                req_parts.append(f"Sitting: {', '.join(sitting)}")
            req_str = " | ".join(req_parts) if req_parts else "—"

            rows.append(
                f"""
                <tr>
                  <td>{booking['bookingCode']}</td>
                  <td>{booking['fromDate']}</td>
                  <td>{booking['toDate']}</td>
                  <td>{booking['startTime']}</td>
                  <td>{booking['endTime']}</td>
                  <td>{booking['venueName']}</td>
                  <td>{booking['bookedBy']}</td>
                  <td>{booking['purpose']}</td>
                  <td>{booking['audienceCount']}</td>
                  <td>{req_str}</td>
                  <td>{booking['status']}</td>
                </tr>
                """
            )
        return "".join(rows)

    header = """
    <tr>
      <th>Booking Code</th>
      <th>From Date</th>
      <th>To Date</th>
      <th>Start Time</th>
      <th>End Time</th>
      <th>Venue</th>
      <th>Booked By</th>
      <th>Purpose</th>
      <th>Audience</th>
      <th>Requirements</th>
      <th>Status</th>
    </tr>
    """

    return f"""
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {{ font-family: Calibri, Arial, sans-serif; padding: 24px; }}
          h1 {{ color: #123c37; margin-bottom: 20px; }}
          h2 {{ color: #1e635b; margin-top: 35px; margin-bottom: 10px; font-size: 16px; }}
          table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
          th, td {{ border: 1px solid #93ada8; padding: 8px; text-align: left; }}
          th {{ background: #dff0eb; font-weight: bold; }}
        </style>
      </head>
      <body>
        <h1>{title}</h1>
        <h2>Active Bookings (Pending &amp; Approved)</h2>
        <table>{header}{make_rows(active_bookings)}</table>
        
        <h2>Previous Booking History (Completed &amp; Cancelled)</h2>
        <table>{header}{make_rows(history_bookings)}</table>
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
            elif filename.endswith(".png"):
                content_type = "image/png"
            elif filename.endswith(".jpg") or filename.endswith(".jpeg"):
                content_type = "image/jpeg"
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
        if parsed.path == "/api/me":
            self.handle_get_current_user()
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
        if parsed.path == "/api/me/change-password":
            self.handle_change_password()
            return
        if parsed.path == "/api/bookings":
            self.handle_create_bookings()
            return
        if parsed.path == "/api/admin/users":
            self.handle_create_user()
            return
        if parsed.path == "/api/admin/bookings/clear":
            self.handle_clear_bookings()
            return
        if parsed.path.startswith("/api/admin/users/") and parsed.path.endswith("/active"):
            self.handle_toggle_user_active(parsed.path)
            return
        if parsed.path.startswith("/api/admin/users/") and parsed.path.endswith("/reset-password"):
            self.handle_admin_reset_password(parsed.path)
            return
        if parsed.path.startswith("/api/bookings/") and parsed.path.endswith("/approve"):
            self.handle_approve_booking(parsed.path)
            return
        if parsed.path.startswith("/api/bookings/") and parsed.path.endswith("/revert"):
            self.handle_revert_booking(parsed.path)
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
        if parsed.path == "/api/admin/logs":
            self.handle_clear_logs()
            return
        if parsed.path.startswith("/api/admin/users/"):
            self.handle_delete_user(parsed.path)
            return
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

    def require_auth(self) -> dict | None:
        token = self.headers.get("X-Session-Token", "")
        session = SESSIONS.get(token)
        if not session:
            self.json_response({"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
            return None
        with db_connection() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = %s", (session["user_id"],)).fetchone()
        if not user:
            self.json_response({"error": "Session user not found."}, HTTPStatus.UNAUTHORIZED)
            return None
        if bool(user["is_deleted"]):
            self.json_response({"error": "This account has been deleted."}, HTTPStatus.FORBIDDEN)
            return None
        return user

    def require_ready_user(self) -> dict | None:
        user = self.require_auth()
        if not user:
            return None
        if user_must_reset_password(user):
            self.json_response(
                {"error": "Please reset your password first before using the app."},
                HTTPStatus.FORBIDDEN,
            )
            return None
        return user

    def handle_bootstrap(self) -> None:
        with db_connection() as conn:
            update_completed_bookings(conn)
            venues = [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "capacity": row["capacity"],
                    "details": row["details"],
                }
                for row in conn.execute(
                    "SELECT * FROM venues WHERE is_active = 1 ORDER BY capacity DESC, name ASC"
                )
            ]
            users = [
                serialize_user(row, row["booking_count"], row["active_booking_count"] or 0)
                for row in conn.execute(
                    """
                    SELECT
                        u.id,
                        u.name,
                        u.email,
                        u.role,
                        u.can_edit_after_48h,
                        u.password_reset_required,
                        u.is_active,
                        u.is_deleted,
                        COUNT(b.id) AS booking_count,
                        SUM(CASE WHEN b.status IN ('pending', 'approved') THEN 1 ELSE 0 END) AS active_booking_count
                    FROM users u
                    LEFT JOIN bookings b ON b.user_id = u.id
                    WHERE u.is_deleted = 0
                    GROUP BY u.id, u.name, u.email, u.role, u.can_edit_after_48h, u.password_reset_required, u.is_active, u.is_deleted
                    ORDER BY u.role DESC, u.name ASC
                    """
                )
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
            inactive_user = conn.execute(
                """
                SELECT id, is_deleted, is_active
                FROM users
                WHERE email = %s
                """,
                (email,),
            ).fetchone()
            if inactive_user:
                if bool(inactive_user["is_deleted"]):
                    self.json_response({"error": "This account has been deleted."}, HTTPStatus.FORBIDDEN)
                    return
                if not bool(inactive_user["is_active"]):
                    self.json_response({"error": "This account is deactivated. Please contact admin."}, HTTPStatus.FORBIDDEN)
                    return
            user = conn.execute(
                """
                SELECT id, name, email, role, can_edit_after_48h, password_reset_required, is_active, is_deleted
                FROM users
                WHERE email = %s AND password = %s AND is_active = 1 AND is_deleted = 0
                """,
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
                    "passwordResetRequired": bool(user["password_reset_required"]),
                },
            }
        )

    def handle_logout(self) -> None:
        token = self.headers.get("X-Session-Token", "")
        SESSIONS.pop(token, None)
        self.json_response({"success": True})

    def handle_get_current_user(self) -> None:
        user = self.require_auth()
        if not user:
            return
        self.json_response({"user": serialize_user(user)})

    # Modification 10: Scrub private booking details for non-admin users to ensure complete GDPR privacy while preventing conflicts globally
    def handle_get_bookings(self) -> None:
        user = self.require_ready_user()
        if not user:
            return
        with db_connection() as conn:
            raw_bookings = fetch_bookings(conn, user=None) # Fetch all active system bookings globally
            
            scrubbed_bookings = []
            for b in raw_bookings:
                if user["role"] == "admin" or b["userId"] == user["id"]:
                    scrubbed_bookings.append(b)
                else:
                    # Scrub user-private booking parameters
                    scrubbed_bookings.append({
                        "id": b["id"],
                        "bookingCode": b["bookingCode"],
                        "userId": b["userId"],
                        "bookedBy": "Unavailable Slot",
                        "ownerName": "Anonymous",
                        "ownerEmail": "anonymous@istefadah.org",
                        "venueId": b["venueId"],
                        "venueName": b["venueName"],
                        "venueCapacity": b["venueCapacity"],
                        "bookingDate": b["bookingDate"],
                        "timeSlot": b["timeSlot"],
                        "purpose": "Unavailable Slot",
                        "audienceCount": b["audienceCount"],
                        "audienceDetails": "",
                        "avitRequirements": [],
                        "sittingArrangements": [],
                        "status": b["status"],
                        "createdAt": b["createdAt"],
                        "updatedAt": b["updatedAt"],
                    })
            self.json_response({"bookings": scrubbed_bookings})

    def handle_get_notifications(self) -> None:
        user = self.require_ready_user()
        if not user:
            return
        with db_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC, id DESC LIMIT 50",
                (user["id"],),
            ).fetchall()
        self.json_response({"notifications": [serialize_notification(row) for row in rows]})

    def handle_create_bookings(self) -> None:
        user = self.require_ready_user()
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
            update_completed_bookings(conn)
            venue = conn.execute(
                "SELECT * FROM venues WHERE id = %s AND is_active = 1",
                (venue_id,),
            ).fetchone()
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
            booking_code = generate_booking_code()
            for booking_date, time_slot in final_pairs:
                cursor = conn.execute(
                    """
                    INSERT INTO bookings (
                        booking_code, user_id, venue_id, booking_date, time_slot, booked_by,
                        purpose, audience_count, audience_details, avit_requirements,
                        status, sitting_arrangements, created_at, updated_at, updated_by_user_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        booking_code,
                        user["id"],
                        venue_id,
                        booking_date,
                        time_slot,
                        booked_by,
                        purpose,
                        audience_count,
                        audience_details,
                        json.dumps(avit_requirements),
                        "pending",
                        json.dumps(sitting_arrangements),
                        utc_iso(),
                        utc_iso(),
                        user["id"],
                    ),
                )
                created_ids.append(cursor.fetchone()["id"])

            for booking_id in created_ids:
                booking = fetch_booking(conn, booking_id)
                if booking:
                    add_notification(
                        conn,
                        user["id"],
                        f"Booking request submitted for approval: {booking['booking_date']} {booking['time_slot']} at {booking['venue_name']}.",
                    )
                    for admin_id in get_admin_ids(conn):
                        add_notification(
                            conn,
                            admin_id,
                            f"Approval pending: {booking['booked_by']} requested {booking['booking_date']} {booking['time_slot']} at {booking['venue_name']}.",
                        )
            
            sync_to_google_sheet_by_code(conn, booking_code)
            created = [serialize_booking(fetch_booking(conn, booking_id)) for booking_id in created_ids]
        self.json_response(
            {
                "message": f"Submitted {len(created)} slot/date selection(s) for approval.",
                "created": created,
                "skippedConflicts": conflicts,
            },
            HTTPStatus.CREATED,
        )

    def handle_update_booking(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        booking_id = int(path.rsplit("/", 1)[-1])
        payload = parse_body(self)

        with db_connection() as conn:
            update_completed_bookings(conn)
            booking = fetch_booking(conn, booking_id)
            if not booking:
                self.json_response({"error": "Booking not found."}, HTTPStatus.NOT_FOUND)
                return
            if booking["status"] == "approved" and user["role"] != "admin":
                self.json_response({"error": "Approved bookings cannot be edited by users."}, HTTPStatus.FORBIDDEN)
                return
            if not user_can_manage_booking(user, booking):
                self.json_response(
                    {"error": "You cannot edit this pending booking after 6 hours unless admin grants rights."},
                    HTTPStatus.FORBIDDEN,
                )
                return

            booking_code = booking["booking_code"]

            new_venue_id = int(payload.get("venueId", booking["venue_id"]))
            new_purpose = payload.get("purpose", booking["purpose"]).strip()
            new_audience_count = int(payload.get("audienceCount", booking["audience_count"]))
            new_audience_details = payload.get("audienceDetails", booking["audience_details"] or "").strip()
            new_avit = payload.get("avitRequirements", json.loads(booking["avit_requirements"] or "[]"))
            new_sitting = payload.get("sittingArrangements", json.loads(booking["sitting_arrangements"] or "[]"))
            new_booked_by = payload.get("bookedBy", booking["booked_by"]).strip()

            dates = sorted(set(payload.get("dates", [booking["booking_date"]])))
            raw_time_slots = payload.get("timeSlots")
            if isinstance(raw_time_slots, list):
                time_slots = sorted({str(item).strip() for item in raw_time_slots if str(item).strip()})
            else:
                fallback_time_slot = payload.get("timeSlot", booking["time_slot"]).strip()
                time_slots = [fallback_time_slot] if fallback_time_slot else []

            venue = conn.execute(
                "SELECT * FROM venues WHERE id = %s AND is_active = 1",
                (new_venue_id,),
            ).fetchone()
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

            conflicts = collect_slot_conflicts(conn, new_venue_id, time_slots, dates, ignore_booking_code=booking_code)
            if conflicts:
                self.json_response({"error": conflicts[0]["message"]}, HTTPStatus.CONFLICT)
                return

            conn.execute("DELETE FROM bookings WHERE booking_code = %s", (booking_code,))

            created_ids = []
            for booking_date in dates:
                for time_slot in time_slots:
                    cursor = conn.execute(
                        """
                        INSERT INTO bookings (
                            booking_code, user_id, venue_id, booking_date, time_slot, booked_by,
                            purpose, audience_count, audience_details, avit_requirements,
                            status, sitting_arrangements, created_at, updated_at, updated_by_user_id
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            booking_code,
                            booking["user_id"],
                            new_venue_id,
                            booking_date,
                            time_slot,
                            new_booked_by,
                            new_purpose,
                            new_audience_count,
                            new_audience_details,
                            json.dumps(new_avit),
                            booking["status"],
                            json.dumps(new_sitting),
                            booking["created_at"],
                            utc_iso(),
                            user["id"],
                        ),
                    )
                    created_ids.append(cursor.fetchone()["id"])

            refreshed = fetch_booking(conn, created_ids[0])
            if refreshed:
                sync_to_google_sheet_by_code(conn, booking_code)
                add_notification(
                    conn,
                    booking["user_id"],
                    f"Booking {booking_code} was updated by {user['name']}.",
                )
                for admin_id in get_admin_ids(conn):
                    if admin_id != user["id"]:
                        add_notification(
                            conn,
                            admin_id,
                            f"Booking {booking_code} was updated by {user['name']}.",
                        )
        self.json_response({"message": "Booking updated successfully.", "booking": serialize_booking(refreshed)})

    def handle_delete_booking(self, path: str) -> None:
        user = self.require_ready_user()
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
                    {"error": "You cannot cancel this booking after the editable period unless admin grants rights."},
                    HTTPStatus.FORBIDDEN,
                )
                return
            booking_code = booking["booking_code"]
            conn.execute(
                "UPDATE bookings SET status = 'cancelled', updated_at = %s, updated_by_user_id = %s WHERE booking_code = %s",
                (utc_iso(), user["id"], booking_code),
            )
            updated_booking = fetch_booking(conn, booking_id)
            if updated_booking:
                sync_to_google_sheet_by_code(conn, booking_code)
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
        self.json_response({"message": "Booking cancelled successfully."})

    def handle_approve_booking(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return
        booking_id = int(path.split("/")[-2])
        with db_connection() as conn:
            booking = fetch_booking(conn, booking_id)
            if not booking:
                self.json_response({"error": "Booking not found."}, HTTPStatus.NOT_FOUND)
                return
            if booking["status"] != "pending":
                self.json_response({"error": "Only pending bookings can be approved."}, HTTPStatus.BAD_REQUEST)
                return

            booking_code = booking["booking_code"]
            bookings_to_approve = conn.execute("SELECT * FROM bookings WHERE booking_code = %s", (booking_code,)).fetchall()

            for b in bookings_to_approve:
                conflicts = find_conflicts(
                    conn,
                    b["venue_id"],
                    b["time_slot"],
                    [b["booking_date"]],
                    ignore_booking_id=b["id"],
                )
                if conflicts:
                    self.json_response({"error": conflicts[0]["message"]}, HTTPStatus.CONFLICT)
                    return

            conn.execute(
                "UPDATE bookings SET status = 'approved', updated_at = %s, updated_by_user_id = %s WHERE booking_code = %s",
                (utc_iso(), user["id"], booking_code),
            )
            refreshed = fetch_booking(conn, booking_id)
            if refreshed:
                sync_to_google_sheet_by_code(conn, booking_code)
                add_notification(
                    conn,
                    booking["user_id"],
                    f"Booking {booking['booking_code']} was approved by admin.",
                )
        self.json_response({"message": "Booking approved successfully.", "booking": serialize_booking(refreshed)})

    def handle_revert_booking(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return
        booking_id = int(path.split("/")[-2])
        with db_connection() as conn:
            booking = fetch_booking(conn, booking_id)
            if not booking:
                self.json_response({"error": "Booking not found."}, HTTPStatus.NOT_FOUND)
                return
            if booking["status"] != "approved":
                self.json_response({"error": "Only approved bookings can be reverted to pending."}, HTTPStatus.BAD_REQUEST)
                return
            
            booking_code = booking["booking_code"]
            conn.execute(
                "UPDATE bookings SET status = 'pending', updated_at = %s, updated_by_user_id = %s WHERE booking_code = %s",
                (utc_iso(), user["id"], booking_code),
            )
            refreshed = fetch_booking(conn, booking_id)
            if refreshed:
                sync_to_google_sheet_by_code(conn, booking_code)
                add_notification(
                    conn,
                    booking["user_id"],
                    f"Booking {booking['booking_code']} was reverted to pending by admin.",
                )
        self.json_response({"message": "Booking reverted to pending successfully.", "booking": serialize_booking(refreshed)})

    def handle_toggle_override(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return
        user_id = int(path.split("/")[4])
        payload = parse_body(self)
        can_edit = 1 if payload.get("canEditAfter48h") else 0
        with db_connection() as conn:
            target = conn.execute("SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
            if not target:
                self.json_response({"error": "User not found."}, HTTPStatus.NOT_FOUND)
                return
            conn.execute(
                "UPDATE users SET can_edit_after_48h = %s WHERE id = %s",
                (can_edit, user_id),
            )
            add_notification(
                conn,
                user_id,
                f"Admin {'granted' if can_edit else 'removed'} post-48-hour edit/delete rights.",
            )
        self.json_response({"message": "Override updated successfully."})

    def handle_toggle_user_active(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return

        user_id = int(path.split("/")[4])
        payload = parse_body(self)
        is_active = 1 if payload.get("isActive", False) else 0
        with db_connection() as conn:
            target = conn.execute("SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
            if not target:
                self.json_response({"error": "User not found."}, HTTPStatus.NOT_FOUND)
                return
            if target["role"] == "admin":
                self.json_response({"error": "Admin accounts cannot be deactivated here."}, HTTPStatus.BAD_REQUEST)
                return
            if bool(target["is_deleted"]):
                self.json_response({"error": "Deleted users cannot be reactivated."}, HTTPStatus.BAD_REQUEST)
                return
            conn.execute(
                "UPDATE users SET is_active = %s WHERE id = %s",
                (is_active, user_id),
            )
            add_notification(
                conn,
                user_id,
                f"Admin {'activated' if is_active else 'deactivated'} your account.",
            )
        self.json_response({"message": "User status updated successfully."})

    def handle_create_user(self) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return

        payload = parse_body(self)
        name = payload.get("name", "").strip()
        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "").strip()

        if not name:
            self.json_response({"error": "Full name is required."}, HTTPStatus.BAD_REQUEST)
            return
        if not email or "@" not in email:
            self.json_response({"error": "A valid email is required."}, HTTPStatus.BAD_REQUEST)
            return
        if len(password) < 4:
            self.json_response({"error": "Password must be at least 4 characters."}, HTTPStatus.BAD_REQUEST)
            return

        with db_connection() as conn:
            existing = conn.execute("SELECT id FROM users WHERE email = %s", (email,)).fetchone()
            if existing:
                self.json_response({"error": "A user with this email already exists."}, HTTPStatus.CONFLICT)
                return

            cursor = conn.execute(
                """
                INSERT INTO users (name, email, password, role, can_edit_after_48h, password_reset_required)
                VALUES (%s, %s, %s, 'user', 0, 0)
                RETURNING id
                """,
                (name, email, password),
            )
            new_user_id = cursor.fetchone()["id"]
            add_notification(
                conn,
                new_user_id,
                f"Your account has been created by admin {user['name']}.",
            )
            created_user = conn.execute(
                """
                SELECT id, name, email, role, can_edit_after_48h, password_reset_required, is_active, is_deleted
                FROM users WHERE id = %s
                """,
                (new_user_id,),
            ).fetchone()

        self.json_response(
            {
                "message": "User created successfully.",
                "user": serialize_user(created_user),
            },
            HTTPStatus.CREATED,
        )

    def handle_change_password(self) -> None:
        user = self.require_auth()
        if not user:
            return

        payload = parse_body(self)
        current_password = payload.get("currentPassword", "").strip()
        new_password = payload.get("newPassword", "").strip()
        confirm_password = payload.get("confirmPassword", "").strip()

        if current_password != user["password"]:
            self.json_response({"error": "Current password is incorrect."}, HTTPStatus.BAD_REQUEST)
            return
        if len(new_password) < 4:
            self.json_response({"error": "New password must be at least 4 characters."}, HTTPStatus.BAD_REQUEST)
            return
        if new_password != confirm_password:
            self.json_response({"error": "New password and confirm password do not match."}, HTTPStatus.BAD_REQUEST)
            return
        if new_password == current_password:
            self.json_response({"error": "Please choose a different new password."}, HTTPStatus.BAD_REQUEST)
            return

        with db_connection() as conn:
            conn.execute(
                """
                UPDATE users
                SET password = %s, password_reset_required = 0
                WHERE id = %s
                """,
                (new_password, user["id"]),
            )
            add_notification(conn, user["id"], "Your password was changed successfully.")
            refreshed = conn.execute(
                """
                SELECT id, name, email, role, can_edit_after_48h, password_reset_required, is_active, is_deleted
                FROM users WHERE id = %s
                """,
                (user["id"],),
            ).fetchone()
        self.json_response({"message": "Password changed successfully.", "user": serialize_user(refreshed)})

    def handle_admin_reset_password(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return

        user_id = int(path.split("/")[4])
        payload = parse_body(self)
        temporary_password = payload.get("temporaryPassword", "").strip()
        if len(temporary_password) < 4:
            self.json_response({"error": "Temporary password must be at least 4 characters."}, HTTPStatus.BAD_REQUEST)
            return

        with db_connection() as conn:
            target = conn.execute("SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
            if not target:
                self.json_response({"error": "User not found."}, HTTPStatus.NOT_FOUND)
                return
            if target["role"] == "admin":
                self.json_response({"error": "Admin accounts cannot be reset from this panel."}, HTTPStatus.BAD_REQUEST)
                return
            conn.execute(
                """
                UPDATE users
                SET password = %s, password_reset_required = 1
                WHERE id = %s
                """,
                (temporary_password, user_id),
            )
            add_notification(
                conn,
                user_id,
                "Admin reset your password. Please log in with the temporary password and change it immediately.",
            )
        self.json_response({"message": "Temporary password set. User must change it after login."})

    def handle_delete_user(self, path: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return

        user_id = int(path.rsplit("/", 1)[-1])
        if user_id == user["id"]:
            self.json_response({"error": "You cannot delete your own account."}, HTTPStatus.BAD_REQUEST)
            return

        with db_connection() as conn:
            update_completed_bookings(conn)
            
            target = conn.execute("SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
            if not target:
                self.json_response({"error": "User not found."}, HTTPStatus.NOT_FOUND)
                return
            if target["role"] == "admin":
                self.json_response({"error": "Admin accounts cannot be deleted here."}, HTTPStatus.BAD_REQUEST)
                return
            active_booking_count = conn.execute(
                """
                SELECT COUNT(*) AS booking_count
                FROM bookings
                WHERE user_id = %s AND status IN ('pending', 'approved')
                """,
                (user_id,),
            ).fetchone()["booking_count"]
            if active_booking_count > 0:
                self.json_response(
                    {"error": "This user has active bookings, so deletion is not allowed."},
                    HTTPStatus.BAD_REQUEST,
                )
                return
            archived_email = f"deleted-{user_id}-{target['email']}"
            archived_name = f"{target['name']} (Deleted)"
            conn.execute(
                """
                UPDATE users
                SET is_active = 0, is_deleted = 1, email = %s, name = %s, password_reset_required = 0
                WHERE id = %s
                """,
                (archived_email, archived_name, user_id),
            )
        self.json_response({"message": "User deleted from active use successfully."})

    def handle_clear_logs(self) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return
        with db_connection() as conn:
            conn.execute("DELETE FROM notifications")
        self.json_response({"message": "Activity logs cleared successfully."})

    def handle_clear_bookings(self) -> None:
        user = self.require_ready_user()
        if not user:
            return
        if user["role"] != "admin":
            self.json_response({"error": "Admin access required."}, HTTPStatus.FORBIDDEN)
            return

        payload = parse_body(self)
        password_attempt = payload.get("password", "")
        if not password_attempt or password_attempt != user["password"]:
            self.json_response({"error": "Verification failed. Incorrect admin password."}, HTTPStatus.UNAUTHORIZED)
            return

        with db_connection() as conn:
            conn.execute("DELETE FROM bookings")
        self.json_response({"message": "All database bookings cleared successfully."})

    def handle_export(self, query: str) -> None:
        user = self.require_ready_user()
        if not user:
            return
        params = parse_qs(query)
        export_format = params.get("format", ["excel"])[0]
        with db_connection() as conn:
            bookings = fetch_bookings(conn, user=None)
            
            # Safeguard context exports for standard users
            if user["role"] != "admin":
                bookings = [b for b in bookings if b["userId"] == user["id"]]

        clubbed = club_bookings_py(bookings)
        active_bookings = [b for b in clubbed if b["status"] in ("pending", "approved")]
        history_bookings = [b for b in clubbed if b["status"] in ("completed", "cancelled")]

        if export_format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            
            writer.writerow(["--- ACTIVE BOOKINGS (PENDING & APPROVED) ---"])
            writer.writerow(["Booking Code", "From Date", "To Date", "Start Time", "End Time", "Venue", "Booked By", "Purpose", "Audience", "Requirements", "Status"])
            for b in active_bookings:
                avit = b.get("avitRequirements", [])
                sitting = b.get("sittingArrangements", [])
                req_parts = []
                if avit:
                    req_parts.append(f"AVIT: {', '.join(avit)}")
                if sitting:
                    req_parts.append(f"Sitting: {', '.join(sitting)}")
                req_str = " | ".join(req_parts) if req_parts else "—"
                writer.writerow(
                    [
                        b["bookingCode"],
                        b["fromDate"],
                        b["toDate"],
                        b["startTime"],
                        b["endTime"],
                        b["venueName"],
                        b["bookedBy"],
                        b["purpose"],
                        b["audienceCount"],
                        req_str,
                        b["status"],
                    ]
                )
            
            writer.writerow([])
            writer.writerow(["--- PREVIOUS BOOKING HISTORY (COMPLETED & CANCELLED) ---"])
            writer.writerow(["Booking Code", "From Date", "To Date", "Start Time", "End Time", "Venue", "Booked By", "Purpose", "Audience", "Requirements", "Status"])
            for b in history_bookings:
                avit = b.get("avitRequirements", [])
                sitting = b.get("sittingArrangements", [])
                req_parts = []
                if avit:
                    req_parts.append(f"AVIT: {', '.join(avit)}")
                if sitting:
                    req_parts.append(f"Sitting: {', '.join(sitting)}")
                req_str = " | ".join(req_parts) if req_parts else "—"
                writer.writerow(
                    [
                        b["bookingCode"],
                        b["fromDate"],
                        b["toDate"],
                        b["startTime"],
                        b["endTime"],
                        b["venueName"],
                        b["bookedBy"],
                        b["purpose"],
                        b["audienceCount"],
                        req_str,
                        b["status"],
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
