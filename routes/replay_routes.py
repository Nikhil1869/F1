
import os
import pickle
import threading
import traceback
import warnings
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request
from scipy.spatial import cKDTree

from config import BASE_DIR, CACHE_DIR, DEFAULT_YEAR
from ml_models.tyre_model import calculate_tyre_health
from services import fastf1_service, openf1_service
from services.data_provider import provider

warnings.filterwarnings("ignore")

replay_bp = Blueprint("replay", __name__, url_prefix="/api/replay")

REPLAY_CACHE_DIR = os.path.join(CACHE_DIR, "replay_cache")
os.makedirs(REPLAY_CACHE_DIR, exist_ok=True)
PRECOMPUTED_DIR = os.path.join(BASE_DIR, "precomputed")
os.makedirs(PRECOMPUTED_DIR, exist_ok=True)

DT = 0.5
DEFAULT_REPLAY_CHUNK_SIZE = 1500
MIN_REPLAY_CHUNK_SIZE = 1500
MAX_REPLAY_CHUNK_SIZE = 2000

_telemetry_jobs = {}
_telemetry_jobs_lock = threading.Lock()

TEAM_COLORS = {
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E8002D",
    "Mercedes": "#27F4D2",
    "McLaren": "#FF8000",
    "Aston Martin": "#229971",
    "Alpine": "#FF87BC",
    "Williams": "#64C4FF",
    "AlphaTauri": "#6692FF",
    "RB": "#6692FF",
    "Kick Sauber": "#52E252",
    "Alfa Romeo": "#C92D4B",
    "Haas F1 Team": "#B6BABD",
}

def _get_cache_path(year, round_num, session_type, sample_rate=None):
    key = f"replay_{year}_{round_num}_{session_type}"
    if sample_rate:
        key = f"{key}_sr{sample_rate}"
    return os.path.join(REPLAY_CACHE_DIR, f"{key}.pkl")

def _get_precomputed_path(year, round_num, session_type, sample_rate):
    key = f"replay_{year}_{round_num}_{session_type}_sr{sample_rate}.json"
    return os.path.join(PRECOMPUTED_DIR, key)

def _sample_cached_replay_data(response_data, sample_rate):
    sample_rate = max(1, int(sample_rate or 1))
    if sample_rate <= 1:
        sampled = dict(response_data)
        sampled["sampleRate"] = 1
        return sampled

    sampled = dict(response_data)
    sampled["frames"] = response_data.get("frames", [])[::sample_rate]
    sampled["dt"] = (response_data.get("dt") or DT) * sample_rate
    sampled["sampleRate"] = sample_rate
    return sampled

def _load_replay_cache(year, round_num, session_type, sample_rate, refresh=False):
    if refresh:
        return None

    cache_path = _get_cache_path(year, round_num, session_type, sample_rate=sample_rate)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "rb") as f:
                response_data = pickle.load(f)
            precomputed_path = _get_precomputed_path(year, round_num, session_type, sample_rate)
            if not os.path.exists(precomputed_path):
                _save_precomputed_replay_data(response_data, year, round_num, session_type, sample_rate)
            return response_data
        except Exception:
            pass

    precomputed_path = _get_precomputed_path(year, round_num, session_type, sample_rate)
    if os.path.exists(precomputed_path):
        try:
            with open(precomputed_path, "r", encoding="utf-8") as f:
                response_data = json.load(f)
            with open(cache_path, "wb") as f:
                pickle.dump(response_data, f)
            return response_data
        except Exception:
            pass

    if sample_rate > 1:
        full_cache_path = _get_cache_path(year, round_num, session_type)
        if os.path.exists(full_cache_path):
            try:
                with open(full_cache_path, "rb") as f:
                    response_data = _sample_cached_replay_data(pickle.load(f), sample_rate)
                with open(cache_path, "wb") as f:
                    pickle.dump(response_data, f)
                _save_precomputed_replay_data(response_data, year, round_num, session_type, sample_rate)
                return response_data
            except Exception:
                pass

    return None

def _save_precomputed_replay_data(response_data, year, round_num, session_type, sample_rate):
    precomputed_path = _get_precomputed_path(year, round_num, session_type, sample_rate)
    try:
        with open(precomputed_path, "w", encoding="utf-8") as f:
            json.dump(response_data, f, separators=(",", ":"))
    except Exception:
        pass

def _telemetry_job_key(year, round_num, session_type, sample_rate):
    return f"{year}:{round_num}:{session_type}:{sample_rate}"

def _get_telemetry_job(job_key):
    with _telemetry_jobs_lock:
        job = _telemetry_jobs.get(job_key)
        return dict(job) if job else None

def _set_telemetry_job(job_key, **updates):
    with _telemetry_jobs_lock:
        job = _telemetry_jobs.setdefault(job_key, {})
        job.update(updates)
        return dict(job)

def _compute_safety_car_positions(frames, track_statuses, session):

    if not frames or not track_statuses:
        return [None] * len(frames)

    try:
        fastest_lap = session.laps.pick_fastest()
        if fastest_lap is None:
            return [None] * len(frames)
        tel = fastest_lap.get_telemetry()
        if tel is None or tel.empty:
            return [None] * len(frames)

        ref_xs = tel["X"].to_numpy().astype(float)
        ref_ys = tel["Y"].to_numpy().astype(float)

        t_old = np.linspace(0, 1, len(ref_xs))
        t_new = np.linspace(0, 1, 4000)
        ref_xs_dense = np.interp(t_new, t_old, ref_xs)
        ref_ys_dense = np.interp(t_new, t_old, ref_ys)

        ref_tree = cKDTree(np.column_stack((ref_xs_dense, ref_ys_dense)))
        diffs = np.sqrt(np.diff(ref_xs_dense)**2 + np.diff(ref_ys_dense)**2)
        ref_cumdist = np.concatenate(([0.0], np.cumsum(diffs)))
        ref_total = float(ref_cumdist[-1])

        dx = np.gradient(ref_xs_dense)
        dy = np.gradient(ref_ys_dense)
        norm = np.sqrt(dx**2 + dy**2)
        norm[norm == 0] = 1.0
        ref_nx, ref_ny = -dy / norm, dx / norm
    except Exception:
        return [None] * len(frames)

    sc_periods = []
    for status in track_statuses:
        if str(status.get("status", "")) == "4":
            sc_periods.append({
                "start_time": status["start_time"],
                "end_time": status.get("end_time"),
            })

    if not sc_periods:
        return [None] * len(frames)

    DEPLOY_PIT_EXIT_DURATION = 4.0
    DEPLOY_TOTAL_MAX = 120.0
    SC_OFFSET_METERS = 150
    RETURN_ACCEL_DURATION = 5.0
    RETURN_ACCEL_SPEED = 400.0
    RETURN_PIT_ENTER_DURATION = 3.0
    RETURN_TOTAL = RETURN_ACCEL_DURATION + RETURN_PIT_ENTER_DURATION
    PIT_OFFSET_INWARD = 400

    def _pos_at_dist(dist_m):
        d = dist_m % ref_total
        idx = min(int(np.searchsorted(ref_cumdist, d)), len(ref_xs_dense) - 1)
        return float(ref_xs_dense[idx]), float(ref_ys_dense[idx])

    def _idx_at_dist(dist_m):
        d = dist_m % ref_total
        return min(int(np.searchsorted(ref_cumdist, d)), len(ref_xs_dense) - 1)

    def _dist_of_point(x, y):
        _, idx = ref_tree.query([x, y])
        return float(ref_cumdist[int(idx)])

    pit_exit_track_dist = ref_total * 0.05
    pit_exit_idx = _idx_at_dist(pit_exit_track_dist)
    pit_exit_track_x, pit_exit_track_y = _pos_at_dist(pit_exit_track_dist)
    pit_exit_pit_x = float(ref_xs_dense[pit_exit_idx] + ref_nx[pit_exit_idx] * PIT_OFFSET_INWARD)
    pit_exit_pit_y = float(ref_ys_dense[pit_exit_idx] + ref_ny[pit_exit_idx] * PIT_OFFSET_INWARD)

    pit_entry_track_dist = ref_total * 0.95
    pit_entry_idx = _idx_at_dist(pit_entry_track_dist)
    pit_entry_track_x, pit_entry_track_y = _pos_at_dist(pit_entry_track_dist)
    pit_entry_pit_x = float(ref_xs_dense[pit_entry_idx] + ref_nx[pit_entry_idx] * PIT_OFFSET_INWARD)
    pit_entry_pit_y = float(ref_ys_dense[pit_entry_idx] + ref_ny[pit_entry_idx] * PIT_OFFSET_INWARD)

    def get_leader_info(frame):
        drivers = frame.get("drivers", {})
        if not drivers:
            return None, None
        best_code, best_progress = None, -1
        for code, pos in drivers.items():
            progress = (max(pos.get("lap", 1), 1) - 1) * ref_total + pos.get("dist", 0)
            if progress > best_progress:
                best_progress = progress
                best_code = code
        if best_code:
            px, py = drivers[best_code]["x"], drivers[best_code]["y"]
            return best_code, _dist_of_point(px, py)
        return None, None

    sc_state = {}
    sc_out = []

    for frame in frames:
        t = frame["t"]
        active_sc, active_sc_idx = None, None

        for sci, sc in enumerate(sc_periods):
            start = sc["start_time"]
            eff_end = sc.get("end_time") + RETURN_TOTAL if sc.get("end_time") else None
            if t >= start and (eff_end is None or t < eff_end):
                active_sc, active_sc_idx = sc, sci
                break

        if active_sc is None:
            sc_out.append(None)
            continue

        elapsed = t - active_sc["start_time"]
        sc_end = active_sc.get("end_time")

        if active_sc_idx not in sc_state:
            sc_state[active_sc_idx] = {
                "track_dist": pit_exit_track_dist, "caught_up": False,
                "last_t": t, "return_start_dist": None, "prev_leader_dist": None
            }
        state = sc_state[active_sc_idx]
        dt_frame = max(0.0, t - state["last_t"])
        state["last_t"] = t

        leader_code, leader_dist = get_leader_info(frame)

        if elapsed < DEPLOY_PIT_EXIT_DURATION:
            phase = "deploying"
            progress = elapsed / DEPLOY_PIT_EXIT_DURATION
            alpha = progress
            smooth_t = 0.5 - 0.5 * np.cos(progress * np.pi)
            sc_x = pit_exit_pit_x + smooth_t * (pit_exit_track_x - pit_exit_pit_x)
            sc_y = pit_exit_pit_y + smooth_t * (pit_exit_track_y - pit_exit_pit_y)

        elif elapsed < DEPLOY_PIT_EXIT_DURATION + DEPLOY_TOTAL_MAX and not state["caught_up"]:
            phase = "deploying"
            alpha = 1.0
            if leader_code is not None:
                if state["prev_leader_dist"] is not None and dt_frame > 0:
                    lmoved = leader_dist - state["prev_leader_dist"]
                    if lmoved > ref_total / 2: lmoved -= ref_total
                    elif lmoved < -ref_total / 2: lmoved += ref_total
                    lspeed = abs(lmoved) / dt_frame
                else:
                    lspeed = 55.0
                state["prev_leader_dist"] = leader_dist
                sc_speed = max(20.0, min(lspeed * 0.8, 60.0))
            else:
                sc_speed = 55.0

            state["track_dist"] = (state["track_dist"] + sc_speed * dt_frame) % ref_total
            sc_x, sc_y = _pos_at_dist(state["track_dist"])
            if leader_code is not None:
                gap_ahead = (state["track_dist"] - leader_dist) % ref_total
                if gap_ahead <= SC_OFFSET_METERS + 50:
                    state["caught_up"] = True

        elif sc_end is not None and t >= sc_end:
            return_elapsed = t - sc_end
            if return_elapsed < RETURN_ACCEL_DURATION:
                phase = "returning"
                alpha = 1.0
                state["track_dist"] = (state["track_dist"] + RETURN_ACCEL_SPEED * dt_frame) % ref_total
                sc_x, sc_y = _pos_at_dist(state["track_dist"])
            else:
                phase = "returning"
                pit_enter_elapsed = return_elapsed - RETURN_ACCEL_DURATION
                progress = min(1.0, pit_enter_elapsed / RETURN_PIT_ENTER_DURATION)
                alpha = max(0.0, 1.0 - progress)
                track_x, track_y = _pos_at_dist(state["track_dist"])
                smooth_t = 0.5 - 0.5 * np.cos(progress * np.pi)
                sc_x = track_x + smooth_t * (pit_entry_pit_x - track_x)
                sc_y = track_y + smooth_t * (pit_entry_pit_y - track_y)

        else:
            phase = "on_track"
            alpha = 1.0
            state["caught_up"] = True
            if leader_code is not None:
                state["track_dist"] = (leader_dist + SC_OFFSET_METERS) % ref_total
            else:
                state["track_dist"] = (state["track_dist"] + 100.0 * dt_frame) % ref_total
            sc_x, sc_y = _pos_at_dist(state["track_dist"])

        sc_out.append({
            "x": round(sc_x, 2), "y": round(sc_y, 2),
            "phase": phase, "alpha": round(alpha, 3)
        })

    return sc_out

def _process_single_driver(args):

    driver_no, session, driver_code = args[:3]
    sample_rate = args[3] if len(args) > 3 else 1
    sample_rate = max(1, int(sample_rate or 1))
    try:
        laps_driver = session.laps.pick_drivers(driver_no)
        if laps_driver.empty:
            return None

        t_all, x_all, y_all = [], [], []
        dist_all, lap_all, speed_all = [], [], []
        gear_all, drs_all, throttle_all, brake_all = [], [], [], []

        total_d = 0.0
        laps_info = {}

        for _, lap in laps_driver.iterlaps():
            lap_tel = lap.get_telemetry()
            lap_num = int(lap.LapNumber)
            compound = str(lap.Compound)
            life = int(lap.TyreLife) if pd.notna(lap.TyreLife) else 0
            
            laps_info[lap_num] = {
                "compound": compound,
                "life": life,
                "health": round(calculate_tyre_health(compound, life), 1)
            }
            if lap_tel.empty:
                continue
            if sample_rate > 1 and len(lap_tel) > sample_rate:
                lap_tel = lap_tel.iloc[::sample_rate].copy()

            t_lap = lap_tel["SessionTime"].dt.total_seconds().to_numpy()
            d_lap = lap_tel["Distance"].to_numpy()

            t_all.append(t_lap)
            x_all.append(lap_tel["X"].to_numpy())
            y_all.append(lap_tel["Y"].to_numpy())
            dist_all.append(total_d + d_lap)
            lap_all.append(np.full_like(t_lap, lap_num))
            speed_all.append(lap_tel["Speed"].to_numpy())
            gear_all.append(lap_tel["nGear"].to_numpy())
            drs_all.append(lap_tel["DRS"].to_numpy())
            throttle_all.append(lap_tel["Throttle"].to_numpy())
            brake_all.append(lap_tel.get("Brake", np.zeros_like(t_lap)).astype(float).to_numpy())

        if not t_all:
            return None

        t = np.concatenate(t_all)
        order = np.argsort(t)

        return {
            "code": driver_code, "data": {
                "t": t[order],
                "x": np.concatenate(x_all)[order], "y": np.concatenate(y_all)[order],
                "dist": np.concatenate(dist_all)[order], "lap": np.concatenate(lap_all)[order],
                "speed": np.concatenate(speed_all)[order], "gear": np.concatenate(gear_all)[order],
                "drs": np.concatenate(drs_all)[order], "throttle": np.concatenate(throttle_all)[order],
                "brake": np.concatenate(brake_all)[order],
            },
            "laps_info": laps_info,
            "t_min": t.min(), "t_max": t.max(),
        }
    except Exception as e:
        print(f"Error processing driver {driver_code}: {e}")
        return None

@replay_bp.route("/sessions")
def available_sessions():

    year = request.args.get("year", DEFAULT_YEAR, type=int)
    try:
        # OpenF1-first via DataProvider (instant, no FastF1 loading)
        from services.data_provider import provider
        events = provider.get_session_list(year, completed_only=False)
        if events:
            return jsonify({"year": year, "events": events})

        # Fallback: FastF1 schedule
        schedule = fastf1_service.get_event_schedule(year)
        fallback_events = []
        for _, row in schedule.iterrows():
            if row["EventFormat"] != "testing":
                fallback_events.append({
                    "round": int(row["RoundNumber"]),
                    "name": row["EventName"],
                    "country": row.get("Country", ""),
                    "date": str(row.get("EventDate", "")),
                })
        return jsonify({"year": year, "events": fallback_events})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@replay_bp.route("/basic")
def replay_basic():
    """
    Step 1 of Lazy Loading: Fast OpenF1 request to get session/driver info.
    Returns almost instantly.
    """
    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", 1, type=int)
    session_type = request.args.get("session", "R")

    try:
        # Find session_key for the race
        schedule = openf1_service.get_event_schedule(year)
        session_key = None
        event_name = f"Round {round_num}"
        country = ""
        for ev in schedule:
            if ev.get("round") == round_num:
                session_key = ev.get("session_key")
                event_name = ev.get("name", event_name)
                country = ev.get("country", "")
                break

        if not session_key:
            # Keep the first lazy-loading step usable even if OpenF1 has a gap.
            schedule_df = fastf1_service.get_event_schedule(year)
            for _, row in schedule_df.iterrows():
                if int(row.get("RoundNumber", 0)) == round_num:
                    event_name = row.get("EventName", event_name)
                    country = row.get("Country", "")
                    break

        # Get drivers from OpenF1
        raw_drivers = openf1_service.get_drivers(session_key) if session_key else []
        driver_info = {}
        for d in raw_drivers:
            abbr = d.get("name_acronym", "")
            if not abbr:
                continue
            color = d.get("team_colour", "FFFFFF")
            if not color.startswith("#"):
                color = f"#{color}"
            driver_info[abbr] = {
                "abbreviation": abbr,
                "firstName": d.get("first_name", ""),
                "lastName": d.get("last_name", ""),
                "team": d.get("team_name", ""),
                "teamColor": color,
                "position": 99,
                "isRetired": False
            }

        return jsonify({
            "year": year,
            "round": round_num,
            "session": session_type,
            "sessionKey": session_key,
            "eventName": event_name,
            "sessionInfo": {
                "eventName": event_name,
                "country": country,
                "year": year,
                "totalLaps": 0,
                "circuitLength": 0,
                "rotation": 0
            },
            "drivers": driver_info,
            "totalChunks": 0
        })
    except Exception as exc:
        return jsonify({"error": str(exc), "trace": traceback.format_exc()}), 500

def _build_sampled_replay_data(year, round_num, session_type, sample_rate):
    session, sample_rate = fastf1_service.get_sampled_telemetry(
        (year, round_num, session_type), sample_rate=sample_rate
    )

    driver_info = {}
    for _, row in session.results.iterrows():
        abbr = row.get("Abbreviation", "")
        team = row.get("TeamName", "Unknown")
        if abbr:
            status = row.get("Status", "Finished")
            finished = status in ["Finished"] or "Lap" in str(status)
            driver_info[abbr] = {
                "abbreviation": abbr,
                "firstName": row.get("FirstName", ""),
                "lastName": row.get("LastName", ""),
                "team": team,
                "teamColor": TEAM_COLORS.get(team, "#FFFFFF"),
                "position": int(row["Position"]) if pd.notna(row.get("Position")) else 99,
                "isRetired": not finished,
            }

    track_coords = []
    drs_zones = []
    fastest = session.laps.pick_fastest()
    if fastest is not None:
        pos = fastest.get_pos_data()
        if pos is not None and not pos.empty:
            step = max(1, len(pos) // 300)
            for i in range(0, len(pos), step):
                track_coords.append([round(float(pos["X"].iloc[i]), 1), round(float(pos["Y"].iloc[i]), 1)])
            if track_coords:
                track_coords.append(track_coords[0])

        tel = fastest.get_telemetry()
        if tel is not None and not tel.empty and "DRS" in tel.columns:
            in_drs = False
            start_idx = 0
            for i in range(len(tel)):
                drs_val = tel["DRS"].iloc[i]
                if drs_val >= 10 and not in_drs:
                    in_drs = True
                    start_idx = i
                elif drs_val < 10 and in_drs:
                    in_drs = False
                    end_idx = i
                    drs_coords = []
                    for j in range(start_idx, end_idx, max(1, (end_idx - start_idx) // 20)):
                        drs_coords.append([round(float(tel["X"].iloc[j]), 1), round(float(tel["Y"].iloc[j]), 1)])
                    if drs_coords:
                        drs_zones.append(drs_coords)
            if in_drs:
                drs_coords = []
                for j in range(start_idx, len(tel), max(1, (len(tel) - start_idx) // 20)):
                    drs_coords.append([round(float(tel["X"].iloc[j]), 1), round(float(tel["Y"].iloc[j]), 1)])
                if drs_coords:
                    drs_zones.append(drs_coords)

    driver_args = [
        (d_no, session, session.get_driver(d_no)["Abbreviation"], sample_rate)
        for d_no in session.drivers
    ]
    driver_data = {}
    driver_laps_info = {}
    t_global_min, t_global_max = None, None

    with ThreadPoolExecutor(max_workers=min(len(driver_args), 20)) as executor:
        for result in executor.map(_process_single_driver, driver_args):
            if result:
                driver_data[result["code"]] = result["data"]
                driver_laps_info[result["code"]] = result["laps_info"]
                if t_global_min is None or result["t_min"] < t_global_min:
                    t_global_min = result["t_min"]
                if t_global_max is None or result["t_max"] > t_global_max:
                    t_global_max = result["t_max"]

    if not driver_data:
        raise ValueError("No valid telemetry data found for any driver")

    local_dt = DT * sample_rate
    timeline = np.arange(t_global_min, t_global_max, local_dt) - t_global_min
    resampled_data = {code: {} for code in driver_data.keys()}

    for code, dd in driver_data.items():
        t_shifted = dd["t"] - t_global_min
        resampled_data[code] = {
            "x": np.interp(timeline, t_shifted, dd["x"]),
            "y": np.interp(timeline, t_shifted, dd["y"]),
            "dist": np.interp(timeline, t_shifted, dd["dist"]),
            "lap": np.interp(timeline, t_shifted, dd["lap"]),
            "speed": np.interp(timeline, t_shifted, dd["speed"]),
            "gear": np.interp(timeline, t_shifted, dd["gear"]),
            "drs": np.interp(timeline, t_shifted, dd["drs"]),
            "throttle": np.interp(timeline, t_shifted, dd["throttle"]),
            "brake": np.interp(timeline, t_shifted, dd["brake"]),
        }

    formatted_statuses = []
    if hasattr(session, "track_status") and not session.track_status.empty:
        for _, ts in session.track_status.iterrows():
            sts = timedelta.total_seconds(ts["Time"]) - t_global_min
            if formatted_statuses:
                formatted_statuses[-1]["end_time"] = sts
            formatted_statuses.append({"status": ts["Status"], "start_time": sts, "end_time": None})

    race_control_messages = []
    if hasattr(session, "race_control_messages") and not session.race_control_messages.empty:
        for _, msg in session.race_control_messages.iterrows():
            time_val = msg["Time"]
            if hasattr(time_val, "total_seconds"):
                msg_time = time_val.total_seconds() - t_global_min
            else:
                msg_time = (time_val - session.t0_date).total_seconds() - t_global_min
            if msg_time < 0.0:
                msg_time = 0.0
            race_control_messages.append({
                "time": round(msg_time, 3),
                "category": str(msg.get("Category", "")),
                "message": str(msg.get("Message", "")),
                "flag": str(msg.get("Flag", "")),
                "scope": str(msg.get("Scope", "")),
                "sector": str(msg.get("Sector", "")),
                "racingNumber": str(msg.get("RacingNumber", "")),
            })

    weather_frames = []
    if hasattr(session, "weather_data") and not session.weather_data.empty:
        w_df = session.weather_data
        w_time = w_df["Time"].dt.total_seconds().to_numpy() - t_global_min
        valid_w = w_time > 0
        w_time = w_time[valid_w]
        if len(w_time) > 0:
            for _, t in enumerate(timeline):
                idx = np.searchsorted(w_time, t)
                idx = min(idx, len(w_time) - 1)
                weather_frames.append({
                    "air_temp": round(float(w_df["AirTemp"].iloc[idx]), 1),
                    "track_temp": round(float(w_df["TrackTemp"].iloc[idx]), 1),
                    "humidity": round(float(w_df["Humidity"].iloc[idx]), 1),
                    "wind_speed": round(float(w_df["WindSpeed"].iloc[idx]), 1),
                    "wind_direction": round(float(w_df["WindDirection"].iloc[idx]), 1),
                    "rainfall": bool(w_df["Rainfall"].iloc[idx]),
                })

    frames = []
    retired = set()
    for i, t in enumerate(timeline):
        frame = {"t": t, "lap": 1, "drivers": {}}
        leader_dist = -1
        for code, d in resampled_data.items():
            if code in retired:
                continue
            x = float(d["x"][i])
            y = float(d["y"][i])
            dist = float(d["dist"][i])
            lap = int(round(d["lap"][i]))
            if lap > frame["lap"]:
                frame["lap"] = lap
            if dist > leader_dist:
                leader_dist = dist
            if i > 200:
                dist_past = float(d["dist"][i - 20])
                if dist - dist_past < 1.0 and driver_info[code]["isRetired"]:
                    retired.add(code)
                    continue
            lap_info = driver_laps_info.get(code, {}).get(
                lap, {"compound": "UNKNOWN", "life": 0, "health": 100.0}
            )
            frame["drivers"][code] = {
                "x": round(x, 1),
                "y": round(y, 1),
                "dist": round(dist, 1),
                "lap": lap,
                "speed": int(d["speed"][i]),
                "gear": int(d["gear"][i]),
                "drs": int(d["drs"][i]),
                "throttle": round(float(d["throttle"][i]), 1),
                "brake": round(float(d["brake"][i]), 1),
                "compound": lap_info["compound"],
                "tyreLife": lap_info["life"],
                "tyreHealth": lap_info.get("health", 100.0),
            }
        frames.append(frame)

    sc_frames = _compute_safety_car_positions(frames, formatted_statuses, session)
    for i, frame in enumerate(frames):
        frame["safety_car"] = sc_frames[i] if sc_frames is not None and i < len(sc_frames) else None
        frame["weather"] = weather_frames[i] if weather_frames and i < len(weather_frames) else None

    circuit_info = session.get_circuit_info()
    circuit_length = float(session.event.get("circuit_length", 5000)) if session.event is not None else 5000
    rotation_deg = float(circuit_info.rotation) if circuit_info else 0.0
    total_laps = int(all(frames) and frames[-1]["lap"] or 1)

    return {
        "year": year,
        "round": round_num,
        "eventName": session.event["EventName"],
        "track": track_coords,
        "totalLaps": total_laps,
        "drivers": driver_info,
        "frames": frames,
        "dt": local_dt,
        "sampleRate": sample_rate,
        "drsZones": drs_zones,
        "raceControlMessages": race_control_messages,
        "sessionInfo": {
            "eventName": session.event["EventName"],
            "circuitName": session.event.get("EventName", ""),
            "country": session.event.get("Country", ""),
            "year": year,
            "date": str(session.event.get("EventDate", "")),
            "totalLaps": total_laps,
            "circuitLength": circuit_length,
            "rotation": rotation_deg,
        },
    }

def _prepare_telemetry_job(job_key, year, round_num, session_type, sample_rate, cache_path):
    _set_telemetry_job(job_key, status="running", error=None, trace=None)
    try:
        response_data = _build_sampled_replay_data(year, round_num, session_type, sample_rate)
        with open(cache_path, "wb") as f:
            pickle.dump(response_data, f)
        _save_precomputed_replay_data(response_data, year, round_num, session_type, sample_rate)
        _set_telemetry_job(job_key, status="complete")
    except Exception as exc:
        _set_telemetry_job(
            job_key,
            status="failed",
            error=str(exc),
            trace=traceback.format_exc(),
        )

def _start_telemetry_job(job_key, year, round_num, session_type, sample_rate, cache_path):
    existing = _get_telemetry_job(job_key)
    if existing and existing.get("status") in {"queued", "running"}:
        return existing

    job = _set_telemetry_job(job_key, status="queued", error=None, trace=None)
    worker = threading.Thread(
        target=_prepare_telemetry_job,
        args=(job_key, year, round_num, session_type, sample_rate, cache_path),
        daemon=True,
    )
    worker.start()
    return job

@replay_bp.route("/telemetry")
def replay_telemetry():
    """
    Step 2 of Lazy Loading: Progressive chunked telemetry from FastF1.
    Chunk 0 also returns trackCoords and drsZones.
    """
    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", 1, type=int)
    session_type = request.args.get("session", "R")
    chunk_index = request.args.get("chunk", 0, type=int)
    sample_rate = request.args.get("sample_rate", 5, type=int)
    chunk_size = request.args.get("chunk_size", DEFAULT_REPLAY_CHUNK_SIZE, type=int)
    refresh = request.args.get("refresh", "false").lower() == "true"

    chunk_index = max(0, chunk_index)
    sample_rate = max(1, sample_rate or 1)
    chunk_size = min(MAX_REPLAY_CHUNK_SIZE, max(MIN_REPLAY_CHUNK_SIZE, chunk_size or DEFAULT_REPLAY_CHUNK_SIZE))

    cache_path = _get_cache_path(year, round_num, session_type, sample_rate=sample_rate)
    response_data = _load_replay_cache(year, round_num, session_type, sample_rate, refresh=refresh)
    job_key = _telemetry_job_key(year, round_num, session_type, sample_rate)

    if response_data is None:
        job = _get_telemetry_job(job_key)
        if job and job.get("status") == "failed":
            return jsonify({
                "status": "failed",
                "error": job.get("error") or "Telemetry preparation failed.",
                "message": "We could not prepare detailed telemetry for this race. Try again or pick another session.",
                "trace": job.get("trace"),
            }), 500

        job = _start_telemetry_job(job_key, year, round_num, session_type, sample_rate, cache_path)
        return jsonify({
            "status": job.get("status", "queued"),
            "jobKey": job_key,
            "message": "Fetching detailed telemetry...",
            "retryAfterMs": 2500,
        }), 202

    total_frames = len(response_data["frames"])
    total_chunks = (total_frames + chunk_size - 1) // chunk_size

    start_idx = chunk_index * chunk_size
    end_idx = min(start_idx + chunk_size, total_frames)
    chunk_frames = response_data["frames"][start_idx:end_idx]

    payload = {
        "status": "ready",
        "chunkIndex": chunk_index,
        "totalChunks": total_chunks,
        "chunkSize": chunk_size,
        "totalFrames": total_frames,
        "startFrame": start_idx,
        "endFrame": end_idx,
        "frames": chunk_frames,
        "dt": response_data["dt"],
        "sampleRate": response_data.get("sampleRate", sample_rate),
        "hasMore": chunk_index + 1 < total_chunks,
    }

    if chunk_index == 0:
        payload["track"] = response_data["track"]
        payload["drsZones"] = response_data["drsZones"]
        payload["drivers"] = response_data["drivers"]
        payload["raceControlMessages"] = response_data["raceControlMessages"]
        payload["sessionInfo"] = response_data["sessionInfo"]
        payload["totalLaps"] = response_data["totalLaps"]

    return jsonify(payload)

@replay_bp.route("/load")
def load_replay():

    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", 1, type=int)
    session_type = request.args.get("session", "R")
    refresh = request.args.get("refresh", "false").lower() == "true"

    cache_path = _get_cache_path(year, round_num, session_type)

    if os.path.exists(cache_path) and not refresh:
        try:
            with open(cache_path, "rb") as f:
                return jsonify(pickle.load(f))
        except Exception:
            pass

    try:
        session = fastf1_service.get_session_full(year, round_num, session_type)

        driver_info = {}
        for _, row in session.results.iterrows():
            abbr = row.get("Abbreviation", "")
            team = row.get("TeamName", "Unknown")
            if abbr:
                status = row.get("Status", "Finished")
                finished = status in ["Finished"] or "Lap" in str(status)
                driver_info[abbr] = {
                    "abbreviation": abbr,
                    "firstName": row.get("FirstName", ""),
                    "lastName": row.get("LastName", ""),
                    "team": team,
                    "teamColor": TEAM_COLORS.get(team, "#FFFFFF"),
                    "position": int(row["Position"]) if pd.notna(row.get("Position")) else 99,
                    "isRetired": not finished,
                }

        track_coords = []
        track_geometry = {}
        drs_zones = []
        fastest = session.laps.pick_fastest()
        if fastest is not None:
            pos = fastest.get_pos_data()
            if pos is not None and not pos.empty:
                step = max(1, len(pos) // 300)
                for i in range(0, len(pos), step):
                    track_coords.append([round(float(pos["X"].iloc[i]), 1), round(float(pos["Y"].iloc[i]), 1)])
                if track_coords: track_coords.append(track_coords[0])
            
            # Extract DRS Zones
            tel = fastest.get_telemetry()
            if tel is not None and not tel.empty and "DRS" in tel.columns:
                in_drs = False
                start_idx = 0
                for i in range(len(tel)):
                    drs_val = tel["DRS"].iloc[i]
                    if drs_val >= 10 and not in_drs:
                        in_drs = True
                        start_idx = i
                    elif drs_val < 10 and in_drs:
                        in_drs = False
                        end_idx = i
                        # Downsample for frontend
                        drs_coords = []
                        for j in range(start_idx, end_idx, max(1, (end_idx - start_idx) // 20)):
                            drs_coords.append([round(float(tel["X"].iloc[j]), 1), round(float(tel["Y"].iloc[j]), 1)])
                        if drs_coords:
                            drs_zones.append(drs_coords)
                if in_drs:
                    drs_coords = []
                    for j in range(start_idx, len(tel), max(1, (len(tel) - start_idx) // 20)):
                        drs_coords.append([round(float(tel["X"].iloc[j]), 1), round(float(tel["Y"].iloc[j]), 1)])
                    if drs_coords:
                        drs_zones.append(drs_coords)

        driver_args = [(d_no, session, session.get_driver(d_no)["Abbreviation"]) for d_no in session.drivers]
        driver_data = {}
        driver_laps_info = {}
        t_global_min, t_global_max = None, None

        with ThreadPoolExecutor(max_workers=min(len(driver_args), 20)) as executor:
            for result in executor.map(_process_single_driver, driver_args):
                if result:
                    driver_data[result["code"]] = result["data"]
                    driver_laps_info[result["code"]] = result["laps_info"]
                    if t_global_min is None or result["t_min"] < t_global_min: t_global_min = result["t_min"]
                    if t_global_max is None or result["t_max"] > t_global_max: t_global_max = result["t_max"]

        if not driver_data:
            return jsonify({"error": "No valid telemetry data found for any driver"}), 404

        timeline = np.arange(t_global_min, t_global_max, DT) - t_global_min
        resampled_data = {code: {} for code in driver_data.keys()}

        for code, dd in driver_data.items():
            t_shifted = dd["t"] - t_global_min
            resampled_data[code] = {
                "x": np.interp(timeline, t_shifted, dd["x"]),
                "y": np.interp(timeline, t_shifted, dd["y"]),
                "dist": np.interp(timeline, t_shifted, dd["dist"]),
                "lap": np.interp(timeline, t_shifted, dd["lap"]),
                "speed": np.interp(timeline, t_shifted, dd["speed"]),
                "gear": np.interp(timeline, t_shifted, dd["gear"]),
                "drs": np.interp(timeline, t_shifted, dd["drs"]),
                "throttle": np.interp(timeline, t_shifted, dd["throttle"]),
                "brake": np.interp(timeline, t_shifted, dd["brake"]),
            }

        formatted_statuses = []
        if hasattr(session, "track_status") and not session.track_status.empty:
            for _, ts in session.track_status.iterrows():
                sts = timedelta.total_seconds(ts["Time"]) - t_global_min
                if formatted_statuses:
                    formatted_statuses[-1]["end_time"] = sts
                formatted_statuses.append({"status": ts["Status"], "start_time": sts, "end_time": None})

        # Process Race Control Messages
        race_control_messages = []
        if hasattr(session, "race_control_messages") and not session.race_control_messages.empty:
            for _, msg in session.race_control_messages.iterrows():
                time_val = msg["Time"]
                if hasattr(time_val, "total_seconds"):
                    msg_time = time_val.total_seconds() - t_global_min
                else:
                    msg_time = (time_val - session.t0_date).total_seconds() - t_global_min
                
                # Keep pre-race messages but clamp them to 0.0 so they appear immediately
                if msg_time < 0.0:
                    msg_time = 0.0
                
                race_control_messages.append({
                        "time": round(msg_time, 3),
                        "category": str(msg.get("Category", "")),
                        "message": str(msg.get("Message", "")),
                        "flag": str(msg.get("Flag", "")),
                        "scope": str(msg.get("Scope", "")),
                        "sector": str(msg.get("Sector", "")),
                        "racingNumber": str(msg.get("RacingNumber", ""))
                    })

        # Process Weather
        weather_frames = []
        if hasattr(session, "weather_data") and not session.weather_data.empty:
            w_df = session.weather_data
            w_time = w_df["Time"].dt.total_seconds().to_numpy() - t_global_min
            valid_w = w_time > 0
            w_time = w_time[valid_w]
            if len(w_time) > 0:
                for i, t in enumerate(timeline):
                    idx = np.searchsorted(w_time, t)
                    idx = min(idx, len(w_time) - 1)
                    weather_frames.append({
                        "air_temp": round(float(w_df["AirTemp"].iloc[idx]), 1),
                        "track_temp": round(float(w_df["TrackTemp"].iloc[idx]), 1),
                        "humidity": round(float(w_df["Humidity"].iloc[idx]), 1),
                        "wind_speed": round(float(w_df["WindSpeed"].iloc[idx]), 1),
                        "wind_direction": round(float(w_df["WindDirection"].iloc[idx]), 1),
                        "rainfall": bool(w_df["Rainfall"].iloc[idx])
                    })

        frames = []
        retired = set()
        for i, t in enumerate(timeline):
            frame = {"t": t, "lap": 1, "drivers": {}}
            leader_dist = -1

            for code, d in resampled_data.items():
                if code in retired:
                    continue

                x, y, dist, lap = float(d["x"][i]), float(d["y"][i]), float(d["dist"][i]), int(round(d["lap"][i]))
                if lap > frame["lap"]: frame["lap"] = lap
                if dist > leader_dist: leader_dist = dist

                if i > 200:
                    dist_past = float(d["dist"][i - 20])
                    if dist - dist_past < 1.0 and driver_info[code]["isRetired"]:
                        retired.add(code)
                        continue
                
                lap_info = driver_laps_info.get(code, {}).get(lap, {"compound": "UNKNOWN", "life": 0, "health": 100.0})

                frame["drivers"][code] = {
                    "x": round(x, 1), "y": round(y, 1), "dist": round(dist, 1), "lap": lap,
                    "speed": int(d["speed"][i]), "gear": int(d["gear"][i]), "drs": int(d["drs"][i]),
                    "throttle": round(float(d["throttle"][i]), 1), "brake": round(float(d["brake"][i]), 1),
                    "compound": lap_info["compound"], "tyreLife": lap_info["life"], "tyreHealth": lap_info.get("health", 100.0)
                }
            frames.append(frame)

        sc_frames = _compute_safety_car_positions(frames, formatted_statuses, session)
        for i, frame in enumerate(frames):
            frame["safety_car"] = sc_frames[i] if sc_frames is not None and i < len(sc_frames) else None
            frame["weather"] = weather_frames[i] if weather_frames and i < len(weather_frames) else None

        circuit_info = session.get_circuit_info()
        circuit_length = float(session.event.get('circuit_length', 5000)) if session.event is not None else 5000
        rotation_deg = float(circuit_info.rotation) if circuit_info else 0.0

        response_data = {
            "year": year, "round": round_num, "eventName": session.event["EventName"],
            "track": track_coords, "totalLaps": int(all(frames) and frames[-1]["lap"] or 1),
            "drivers": driver_info, "frames": frames, "dt": DT,
            "drsZones": drs_zones,
            "raceControlMessages": race_control_messages,
            "sessionInfo": {
                "eventName": session.event["EventName"],
                "circuitName": session.event.get("EventName", ""),
                "country": session.event.get("Country", ""),
                "year": year,
                "date": str(session.event.get("EventDate", "")),
                "totalLaps": int(all(frames) and frames[-1]["lap"] or 1),
                "circuitLength": circuit_length,
                "rotation": rotation_deg
            }
        }

        try:
            with open(cache_path, "wb") as f:
                pickle.dump(response_data, f)
        except Exception:
            pass

        return jsonify(response_data)

    except Exception as exc:
        return jsonify({"error": str(exc), "trace": traceback.format_exc()}), 500

@replay_bp.route("/driver-telemetry")
def driver_telemetry():

    return jsonify({"error": "Telemetry is now included in main replay stream"}), 404
