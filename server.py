from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"

if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

if os.getenv("VERCEL") and os.path.isdir("/tmp"):
    os.chdir("/tmp")

import pandas as pd
import requests
import livef1

livef1.set_log_level("ERROR")

TEAM_COLORS = {
    "Mercedes": "00D7B6",
    "Ferrari": "ED1131",
    "McLaren": "F47600",
    "Red Bull Racing": "4781D7",
    "Racing Bulls": "6C98FF",
    "Alpine": "00A1E8",
    "Williams": "1868DB",
    "Audi": "F50537",
    "Cadillac": "909090",
    "Aston Martin": "229971",
    "Haas F1 Team": "9C9FA2",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

SEASON_TTL = 60 * 60 * 6
SESSION_TTL_STATIC = 60 * 10
SESSION_TTL_LIVE = 6
STANDINGS_TTL = 60 * 30

CACHE_LOCK = threading.Lock()
CACHE: dict[str, Any] = {
    "seasons": {},
    "sessions": {},
    "standings": {},
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def request_json(url: str, params: dict[str, Any] | None = None) -> Any:
    response = requests.get(url, params=params, headers=HEADERS, timeout=20)
    response.raise_for_status()
    return response.json()


def parse_offset(offset_value: Any) -> timezone:
    raw = str(offset_value or "00:00:00").strip()
    sign = -1 if raw.startswith("-") else 1
    trimmed = raw[1:] if raw[0] in "+-" else raw
    hours, minutes, seconds = [int(part) for part in trimmed.split(":")]
    return timezone(sign * timedelta(hours=hours, minutes=minutes, seconds=seconds))


def local_timestamp_to_utc(value: Any, offset_value: Any) -> datetime:
    local_dt = pd.Timestamp(value).to_pydatetime()
    aware_local = local_dt.replace(tzinfo=parse_offset(offset_value))
    return aware_local.astimezone(timezone.utc)


def isoformat(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        if pd.isna(value):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def clean_text(value: Any, fallback: str = "--") -> str:
    if value is None:
        return fallback
    if isinstance(value, float) and pd.isna(value):
        return fallback
    text = str(value).replace("\xa0", " ").strip()
    return text or fallback


def color_for_team(team_name: str | None) -> str:
    return TEAM_COLORS.get(team_name or "", "FFFFFF")


def compress_points(points: list[dict[str, int]], limit: int = 420) -> list[dict[str, int]]:
    if len(points) <= limit:
        return points
    step = max(1, len(points) // limit)
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def empty_track(mode_label: str, note: str) -> dict[str, Any]:
    return {
        "modeLabel": mode_label,
        "note": note,
        "pathPoints": [],
        "dots": [],
    }


def get_cached_season(year: int) -> dict[str, Any]:
    with CACHE_LOCK:
        cached = CACHE["seasons"].get(year)
        if cached and time.time() - cached["timestamp"] < SEASON_TTL:
            return cached

    meetings = request_json(f"https://api.openf1.org/v1/meetings", params={"year": year})
    sessions = request_json(
        f"https://api.openf1.org/v1/sessions",
        params={"year": year, "session_name": "Race"},
    )
    meetings_by_key = {meeting["meeting_key"]: meeting for meeting in meetings}

    races = []
    for session in sessions:
        if session.get("is_cancelled"):
            continue

        meeting = meetings_by_key.get(session["meeting_key"], {})
        start_utc = pd.Timestamp(session["date_start"]).to_pydatetime().astimezone(timezone.utc)
        end_utc = pd.Timestamp(session["date_end"]).to_pydatetime().astimezone(timezone.utc)

        races.append(
            {
                "meetingKey": safe_int(session["meeting_key"]),
                "sessionKey": safe_int(session["session_key"]),
                "meetingName": clean_text(meeting.get("meeting_name"), clean_text(session.get("country_name"), "Grand Prix")),
                "officialName": clean_text(meeting.get("meeting_official_name"), clean_text(meeting.get("meeting_name"), "Grand Prix")),
                "circuit": clean_text(meeting.get("circuit_short_name"), clean_text(session.get("circuit_short_name"), "Unknown circuit")),
                "country": clean_text(meeting.get("country_name"), clean_text(session.get("country_name"), "Unknown country")),
                "countryCode": clean_text(meeting.get("country_code"), clean_text(session.get("country_code"), "--")),
                "location": clean_text(meeting.get("location"), clean_text(session.get("location"), "Unknown location")),
                "startUtc": start_utc,
                "endUtc": end_utc,
            }
        )

    races.sort(key=lambda race: race["startUtc"])
    entry = {
        "timestamp": time.time(),
        "races": races,
    }

    with CACHE_LOCK:
        CACHE["seasons"][year] = entry

    return entry


def get_context(races: list[dict[str, Any]]) -> dict[str, Any]:
    now = utc_now()
    active = next(
        (
            race
            for race in races
            if race["startUtc"] <= now <= race["endUtc"] + timedelta(hours=3)
        ),
        None,
    )
    completed = [race for race in races if race["endUtc"] <= now]
    next_race = next((race for race in races if race["startUtc"] > now), None)
    latest_completed = completed[-1] if completed else None
    focus = active or latest_completed or next_race or (races[0] if races else None)

    return {
        "active": active,
        "latest_completed": latest_completed,
        "next": next_race,
        "focus": focus,
        "completed_count": len(completed),
    }


def get_session_object(year: int, race: dict[str, Any]):
    cache_key = (year, race["sessionKey"])
    with CACHE_LOCK:
        cached = CACHE["sessions"].get(cache_key)
        if cached:
            return cached["session"]

    session = livef1.get_session(
        season=year,
        meeting_key=race["meetingKey"],
        session_key=race["sessionKey"],
    )

    with CACHE_LOCK:
        CACHE["sessions"][cache_key] = {"session": session}

    return session


def get_topic_data(session, topic: str, force: bool = False) -> pd.DataFrame:
    try:
        data = session.get_data(topic, force=force)
        return data if isinstance(data, pd.DataFrame) else pd.DataFrame(data)
    except Exception:
        return pd.DataFrame()


def format_gap(position: int | None, gap_value: Any, interval_value: Any) -> str:
    if position == 1:
        return "Leader"

    candidate = gap_value if clean_text(gap_value, "") else interval_value
    text = clean_text(candidate, "--")
    if text in {"", "--"}:
        return "--"

    if text.startswith("+") or "LAP" in text.upper():
        return text

    return f"+{text}s"


def format_status(row: pd.Series) -> str:
    if bool(row.get("Retired")):
        return "Retired"
    if bool(row.get("InPit")):
        return "In pit"
    if bool(row.get("PitOut")):
        return "Pit out"
    if bool(row.get("Stopped")):
        return "Stopped"
    return "On track"


def build_race_rows(driver_df: pd.DataFrame, timing_df: pd.DataFrame) -> list[dict[str, Any]]:
    if driver_df.empty or timing_df.empty:
        return []

    timing = timing_df.copy()
    timing["DriverNo"] = pd.to_numeric(timing["DriverNo"], errors="coerce")
    timing["Position"] = pd.to_numeric(timing["Position"], errors="coerce")
    timing = timing.dropna(subset=["DriverNo"]).sort_values("timestamp")
    latest_timing = timing.groupby("DriverNo", as_index=False).tail(1)
    latest_timing = latest_timing.sort_values(["Position", "Line"], na_position="last")

    drivers = driver_df.copy()
    drivers["RacingNumber"] = pd.to_numeric(drivers["RacingNumber"], errors="coerce")
    driver_lookup = {
        safe_int(row["RacingNumber"]): row
        for _, row in drivers.dropna(subset=["RacingNumber"]).iterrows()
    }

    rows = []
    for _, row in latest_timing.iterrows():
        driver_number = safe_int(row["DriverNo"])
        if driver_number is None:
            continue

        driver = driver_lookup.get(driver_number, {})
        team_name = clean_text(driver.get("TeamName"), "--")
        position = safe_int(row.get("Position"))
        rows.append(
            {
                "driverNumber": driver_number,
                "position": position,
                "acronym": clean_text(driver.get("Tla"), f"#{driver_number}"),
                "fullName": clean_text(driver.get("FullName"), clean_text(driver.get("BroadcastName"), f"Driver {driver_number}")),
                "teamName": team_name,
                "teamColor": clean_text(driver.get("TeamColour"), color_for_team(team_name)),
                "gap": format_gap(position, row.get("GapToLeader"), row.get("IntervalToPositionAhead_Value")),
                "lastLap": clean_text(row.get("LastLapTime_Value"), "--"),
                "statusText": format_status(row),
            }
        )

    return rows


def build_track_payload(position_df: pd.DataFrame, race_rows: list[dict[str, Any]], live_mode: bool) -> dict[str, Any]:
    if position_df.empty:
        return {
            "modeLabel": "Waiting for track data",
            "note": "Track points are not available for this session yet.",
            "pathPoints": [],
            "dots": [],
        }

    positions = position_df.copy()
    positions["DriverNo"] = pd.to_numeric(positions["DriverNo"], errors="coerce")
    positions["X"] = pd.to_numeric(positions["X"], errors="coerce")
    positions["Y"] = pd.to_numeric(positions["Y"], errors="coerce")
    positions = positions.dropna(subset=["DriverNo", "X", "Y"]).sort_values("timestamp")
    positions = positions[(positions["X"] != 0) | (positions["Y"] != 0)]

    if positions.empty:
        return {
            "modeLabel": "Grid ghosting",
            "note": "The session only returned zeroed track coordinates, so the circuit map is waiting for real track motion.",
            "pathPoints": [],
            "dots": [],
        }

    latest_points = positions.groupby("DriverNo", as_index=False).tail(1)
    race_lookup = {row["driverNumber"]: row for row in race_rows}

    dots = []
    for _, point in latest_points.iterrows():
        driver_number = safe_int(point["DriverNo"])
        if driver_number is None or driver_number not in race_lookup:
            continue

        row = race_lookup[driver_number]
        dots.append(
            {
                "driverNumber": driver_number,
                "position": row["position"],
                "acronym": row["acronym"],
                "teamColor": row["teamColor"],
                "x": int(point["X"]),
                "y": int(point["Y"]),
            }
        )

    leader_number = race_rows[0]["driverNumber"] if race_rows else None
    if leader_number is None:
        most_samples = positions["DriverNo"].value_counts().index[0]
        leader_number = safe_int(most_samples)

    path_source = positions[positions["DriverNo"] == leader_number]
    if path_source.empty:
        path_source = positions

    deduped_points = []
    last_point = None
    for _, point in path_source.iterrows():
        current = {"x": int(point["X"]), "y": int(point["Y"])}
        if current != last_point:
            deduped_points.append(current)
            last_point = current

    return {
        "modeLabel": "Live circuit" if live_mode else "Replay circuit",
        "note": (
            "Driver dots are being drawn from the latest Position.z samples returned by livef1."
            if live_mode
            else "The circuit is reconstructed from the latest completed race so you still get a motion-heavy view between race weekends."
        ),
        "pathPoints": compress_points(deduped_points),
        "dots": sorted(dots, key=lambda row: row["position"] or 999),
    }


def clean_driver_name(raw_name: Any) -> tuple[str, str]:
    text = clean_text(raw_name, "--")
    match = re.search(r"([A-Z]{3})$", text)
    acronym = match.group(1) if match else ""
    driver = re.sub(r"([A-Z]{3})$", "", text).strip()
    return driver or text, acronym


def read_html_table(url: str) -> pd.DataFrame:
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    tables = pd.read_html(StringIO(response.text))
    return tables[0] if tables else pd.DataFrame()


def get_championship_standings(year: int) -> dict[str, list[dict[str, Any]]]:
    with CACHE_LOCK:
        cached = CACHE["standings"].get(year)
        if cached and time.time() - cached["timestamp"] < STANDINGS_TTL:
            return cached["payload"]

    drivers_df = read_html_table(f"https://www.formula1.com/en/results/{year}/drivers/")
    teams_df = read_html_table(f"https://www.formula1.com/en/results/{year}/team/")

    drivers = []
    for _, row in drivers_df.iterrows():
        driver_name, acronym = clean_driver_name(row.get("Driver"))
        team = clean_text(row.get("Team"), "--")
        drivers.append(
            {
                "position": safe_int(row.get("Pos."), 0),
                "driver": driver_name,
                "acronym": acronym,
                "team": team,
                "teamColor": color_for_team(team),
                "points": safe_int(row.get("Pts."), 0),
            }
        )

    teams = []
    for _, row in teams_df.iterrows():
        team = clean_text(row.get("Team"), "--")
        teams.append(
            {
                "position": safe_int(row.get("Pos."), 0),
                "team": team,
                "teamColor": color_for_team(team),
                "points": safe_int(row.get("Pts."), 0),
            }
        )

    payload = {
        "drivers": drivers,
        "teams": teams,
    }

    with CACHE_LOCK:
        CACHE["standings"][year] = {
            "timestamp": time.time(),
            "payload": payload,
        }

    return payload


def get_session_snapshot(year: int, race: dict[str, Any], live_mode: bool) -> dict[str, Any]:
    cache_key = f"{year}:{race['sessionKey']}:snapshot"
    ttl = SESSION_TTL_LIVE if live_mode else SESSION_TTL_STATIC

    with CACHE_LOCK:
        cached = CACHE["sessions"].get(cache_key)
        if cached and time.time() - cached["timestamp"] < ttl:
            return cached["payload"]

    session = get_session_object(year, race)
    driver_df = get_topic_data(session, "DriverList", force=False)
    timing_df = get_topic_data(session, "TimingDataF1", force=live_mode)
    position_df = get_topic_data(session, "Position.z", force=live_mode)
    status_df = get_topic_data(session, "SessionStatus", force=live_mode)

    race_rows = build_race_rows(driver_df, timing_df)
    session_status = (
        clean_text(status_df.sort_values("timestamp").iloc[-1]["status"])
        if not status_df.empty
        else ("Started" if live_mode else "Finished")
    )

    payload = {
        "status": session_status,
        "raceRows": race_rows,
        "topThree": race_rows[:3],
        "track": build_track_payload(position_df, race_rows, live_mode),
        "title": (
            f"{race['meetingName']} live race order"
            if live_mode
            else f"{race['meetingName']} final classification"
        ),
    }

    with CACHE_LOCK:
        CACHE["sessions"][cache_key] = {
            "timestamp": time.time(),
            "payload": payload,
        }

    return payload


def build_dashboard_payload() -> dict[str, Any]:
    year = utc_now().year
    season_bundle = get_cached_season(year)
    races = season_bundle["races"]
    context = get_context(races)
    standings = get_championship_standings(year)

    focus = context["focus"]
    next_race = context["next"] or {}
    live_mode = focus is not None and context["active"] is not None and focus["sessionKey"] == context["active"]["sessionKey"]

    race_snapshot = {
        "status": "Waiting",
        "raceRows": [],
        "topThree": standings["drivers"][:3],
        "track": empty_track(
            "Waiting for a race",
            "The track map will animate once live or completed race position data is available.",
        ),
        "title": "No race order yet",
    }

    if focus and context["latest_completed"] and focus["sessionKey"] == context["latest_completed"]["sessionKey"]:
        race_snapshot = get_session_snapshot(year, focus, live_mode=False)
    elif focus and live_mode:
        race_snapshot = get_session_snapshot(year, focus, live_mode=True)

    active_snapshot = get_session_snapshot(year, context["active"], live_mode=True) if context["active"] else None

    if focus:
        phase = "Live race mode" if live_mode else "Latest completed race" if context["latest_completed"] and focus["sessionKey"] == context["latest_completed"]["sessionKey"] else "Countdown mode"
        summary = (
            "The backend is using livef1 timing and position feeds for the active race."
            if live_mode
            else "There is no active race right now, so the dashboard is showing the latest completed Grand Prix plus championship ladders."
            if context["latest_completed"] and focus["sessionKey"] == context["latest_completed"]["sessionKey"]
            else "The next-race countdown is active. Live race order and circuit motion will switch on automatically during race sessions."
        )
    else:
        phase = "Schedule unavailable"
        summary = "The season schedule could not be loaded."

    calendar = []
    for round_number, race in enumerate(races, start=1):
        calendar.append(
            {
                "round": round_number,
                "meetingName": race["meetingName"],
                "circuit": race["circuit"],
                "country": race["country"],
                "countryCode": race["countryCode"],
                "location": race["location"],
                "startIso": isoformat(race["startUtc"]),
                "isActive": bool(context["active"] and context["active"]["sessionKey"] == race["sessionKey"]),
                "isNext": bool(context["next"] and context["next"]["sessionKey"] == race["sessionKey"]),
                "isCompleted": race["endUtc"] <= utc_now(),
            }
        )

    live_session = {
        "active": bool(context["active"] and active_snapshot),
        "meetingName": "No race today",
        "circuit": "--",
        "location": "--",
        "country": "--",
        "title": "No race today",
        "status": "Offline",
        "summary": "No race today. Live driver dots and on-track positions will appear automatically when a race session goes green.",
        "track": empty_track(
            "No race today",
            "Live circuit motion is only shown during an active race session.",
        ),
        "raceOrder": [],
    }

    if context["active"] and active_snapshot:
        live_session = {
            "active": True,
            "meetingName": context["active"]["meetingName"],
            "circuit": context["active"]["circuit"],
            "location": context["active"]["location"],
            "country": context["active"]["country"],
            "title": active_snapshot["title"],
            "status": active_snapshot["status"],
            "summary": "Live timing and Position.z samples are streaming from the current race session.",
            "track": active_snapshot["track"],
            "raceOrder": active_snapshot["raceRows"],
        }

    payload = {
        "meta": {
            "updatedAt": isoformat(utc_now()),
            "mode": "live" if live_mode else "completed" if context["latest_completed"] else "countdown",
            "modeLabel": phase,
            "refreshMs": 6000 if live_mode else 30000,
            "feed": "livef1 + official F1 results",
        },
        "season": {
            "year": year,
            "completedRaces": context["completed_count"],
            "totalRaces": len(races),
        },
        "focus": {
            "round": next((index for index, race in enumerate(races, start=1) if focus and race["sessionKey"] == focus["sessionKey"]), None),
            "meetingName": focus["meetingName"] if focus else "No focus race",
            "officialName": focus["officialName"] if focus else "--",
            "circuit": focus["circuit"] if focus else "--",
            "country": focus["country"] if focus else "--",
            "countryCode": focus["countryCode"] if focus else "--",
            "location": focus["location"] if focus else "--",
            "startIso": isoformat(focus["startUtc"]) if focus else None,
            "endIso": isoformat(focus["endUtc"]) if focus else None,
            "status": race_snapshot["status"],
            "phaseLabel": phase,
            "summary": summary,
            "topThree": race_snapshot["topThree"],
        },
        "nextRace": {
            "round": next((index for index, race in enumerate(races, start=1) if next_race and race["sessionKey"] == next_race.get("sessionKey")), None),
            "meetingName": next_race.get("meetingName", "Season complete"),
            "circuit": next_race.get("circuit", "--"),
            "location": next_race.get("location", "--"),
            "country": next_race.get("country", "--"),
            "countryCode": next_race.get("countryCode", "--"),
            "startIso": isoformat(next_race.get("startUtc")),
        },
        "raceOrder": {
            "title": race_snapshot["title"],
            "rows": race_snapshot["raceRows"],
        },
        "championship": standings,
        "track": race_snapshot["track"],
        "liveSession": live_session,
        "calendar": calendar,
    }

    return payload


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory or str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/dashboard":
            self.handle_dashboard()
            return
        if parsed.path == "/api/health":
            self.respond_json({"ok": True, "timestamp": isoformat(utc_now())})
            return
        super().do_GET()

    def handle_dashboard(self):
        try:
            payload = build_dashboard_payload()
            self.respond_json(payload)
        except Exception as exc:
            self.respond_json(
                {
                    "error": str(exc),
                    "timestamp": isoformat(utc_now()),
                },
                status=500,
            )

    def respond_json(self, payload: dict[str, Any], status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args):
        print(f"[server] {self.address_string()} - {format % args}")


def main():
    port = int(os.environ.get("PORT", "8000"))
    handler = partial(DashboardHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"F1 Pulse is running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
