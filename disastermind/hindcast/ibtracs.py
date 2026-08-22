"""Bulk IBTrACS cyclone fetch — replay the WHOLE record, not two cherry-picked storms.

The Fani/Amphan hindcasts prove the pipeline on two famous storms. This module
generalises that to the entire modern North-Indian-Ocean best-track record:
**every named, India-region-landfalling cyclone since 1990** (~90 storms), so the
hindcast becomes a population statistic ("the system activates with N h lead on
X% of real storms") rather than an anecdote.

Source: **NOAA IBTrACS v04r01**, North Indian Ocean basin CSV — the authoritative
international best-track archive (free bulk download). Each storm is reduced to
the same leak-free shape the replay engine already consumes (a list of
``TrackPoint`` + a landfall record derived purely from the track), so it flows
straight through :func:`disastermind.hindcast.replay` machinery.

Fetch (network): ``python -m disastermind.hindcast.ibtracs`` writes the committed
fixture. Everything downstream reads that JSON offline. Casualty/evacuation
*outcomes* are NOT in IBTrACS, so the bulk backtest scores what the track alone
supports — landfall-extrapolation error and activation lead time — while the two
hand-curated cases (Fani/Amphan) keep their documented-outcome scoring.
"""
from __future__ import annotations

import csv
import datetime as _dt
import io
import json
import os
import ssl
import statistics
import sys
import urllib.request
from dataclasses import dataclass

from ..models.geo import LatLon, haversine
from .fani import FaniCase, TrackPoint
from .replay import _parse, extrapolate_landfall

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "ibtracs_ni_landfalling.json")
_IBTRACS_URL = (
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-"
    "stewardship-ibtracs/v04r01/access/csv/ibtracs.NI.list.v04r01.csv"
)
#: Modern era — best tracks before 1990 are sparse/less reliable.
MIN_SEASON = 1990
#: Named-storm wind floor (kt) — a real cyclonic storm, not a depression.
MIN_MAX_WIND_KT = 34.0


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if not ctx.cert_store_stats().get("x509_ca") and os.path.exists("/etc/ssl/cert.pem"):
        ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return ctx


def _f(v: str) -> float | None:
    v = (v or "").strip()
    if v in ("", "NaN", "NA"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def fetch_ibtracs(out_path: str = FIXTURE) -> dict:
    """Download IBTrACS NI, filter to named India-region landfalling storms, commit.

    Filter: season >= :data:`MIN_SEASON`, a real name, max WMO wind >=
    :data:`MIN_MAX_WIND_KT`, and at least one track point at the coast
    (``DIST2LAND <= 0``). Each storm's track is reduced to the leak-free
    ``(time, lat, lon, wind_kt, pres_mb, dist2land_km)`` shape.
    """
    with urllib.request.urlopen(_IBTRACS_URL, timeout=180, context=_ssl_context()) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))
    hdr = rows[0]
    idx = {c: i for i, c in enumerate(hdr)}
    storms: dict[str, list[list[str]]] = {}
    for r in rows[2:]:  # row 1 is a units row
        if not r:
            continue
        season = _f(r[idx["SEASON"]])
        if season is None or season < MIN_SEASON:
            continue
        storms.setdefault(r[idx["SID"]], []).append(r)

    out_storms = []
    for sid, pts in storms.items():
        name = (pts[0][idx["NAME"]] or "").strip()
        if name in ("", "UNNAMED", "NOT_NAMED"):
            continue
        winds = [w for w in (_f(p[idx["WMO_WIND"]]) for p in pts) if w is not None]
        if not winds or max(winds) < MIN_MAX_WIND_KT:
            continue
        track = []
        for p in pts:
            lat, lon = _f(p[idx["LAT"]]), _f(p[idx["LON"]])
            if lat is None or lon is None:
                continue
            track.append(
                {
                    "time": p[idx["ISO_TIME"]].strip(),
                    "lat": round(lat, 3),
                    "lon": round(lon, 3),
                    "wind_kt": _f(p[idx["WMO_WIND"]]),
                    "pres_mb": _f(p[idx["WMO_PRES"]]),
                    "dist2land_km": _f(p[idx["DIST2LAND"]]),
                }
            )
        # require a real landfall (reaches the coast) to score against
        if not any(t["dist2land_km"] is not None and t["dist2land_km"] <= 0 for t in track):
            continue
        out_storms.append(
            {
                "sid": sid,
                "name": name,
                "season": int(pts[0][idx["SEASON"]]),
                "max_wind_kt": max(winds),
                "track": track,
            }
        )

    out_storms.sort(key=lambda s: (s["season"], s["name"]))
    fixture = {
        "source": {
            "name": "NOAA IBTrACS v04r01 — North Indian Ocean best tracks",
            "url": _IBTRACS_URL,
            "filter": f"named, landfalling (dist2land<=0), max WMO wind >= "
            f"{MIN_MAX_WIND_KT:.0f} kt, season >= {MIN_SEASON}",
            "note": "Casualty/evacuation outcomes are NOT in IBTrACS; the bulk "
            "backtest scores landfall-extrapolation error + activation lead time.",
        },
        "storms": out_storms,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(fixture, fh, separators=(",", ":"))
    print(f"ibtracs: {len(out_storms)} named landfalling storms since {MIN_SEASON}", file=sys.stderr)
    return fixture


def load_ibtracs_cases(path: str = FIXTURE) -> list[FaniCase]:
    """Load the committed IBTrACS fixture as replay-ready :class:`FaniCase` objects.

    The ``outcome`` carries only what the track supports (landfall place is a
    coarse lat/lon, intensity is the max wind) — no casualties, by honesty.
    """
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)
    cases: list[FaniCase] = []
    for s in raw["storms"]:
        track = [
            TrackPoint(
                time=t["time"],
                lat=float(t["lat"]),
                lon=float(t["lon"]),
                wind_kt=t.get("wind_kt"),
                pres_mb=t.get("pres_mb"),
                dist2land_km=t.get("dist2land_km"),
            )
            for t in s["track"]
        ]
        cases.append(
            FaniCase(
                track=track,
                outcome={
                    "landfall_intensity": f"max {s['max_wind_kt']:.0f} kt (WMO)",
                    "evacuated": "n/a (IBTrACS track only)",
                    "deaths": "n/a",
                },
                source=raw["source"]["name"],
                source_url=raw["source"]["url"],
                storm=s["name"],
                season=int(s["season"]),
            )
        )
    return cases


#: Cyclonic-storm wind threshold (kt) — the IMD alert level that activates Module A.
ALERT_WIND_KT = 34.0
#: Forecast cutoffs (hours before landfall) for the track-extrapolation score.
LEADS = (24, 48, 72)


@dataclass
class StormScore:
    """Per-storm leak-free hindcast result (track + activation only — no casualties)."""

    storm: str
    season: int
    landfall_time: str
    max_wind_kt: float
    activation_lead_h: float | None  # earliest lead at which it was already a cyclone alert
    track_error_km: dict[int, float]  # lead-hours -> landfall extrapolation error (km)

    def to_dict(self) -> dict:
        return {
            "storm": self.storm,
            "season": self.season,
            "landfall_time": self.landfall_time,
            "max_wind_kt": self.max_wind_kt,
            "activation_lead_h": self.activation_lead_h,
            "track_error_km": {str(k): v for k, v in self.track_error_km.items()},
        }


def _hours(a: str, b: str) -> float:
    return (_parse(a) - _parse(b)).total_seconds() / 3600.0


def score_storm(case: FaniCase, leads: tuple[int, ...] = LEADS) -> StormScore:
    """Leak-free scoring for one storm: activation lead + extrapolation error per lead."""
    landfall = case.landfall_point()
    # Activation lead = the most warning time at which the storm was already a
    # cyclone alert (wind >= 34 kt) before landfall — only pre-landfall points.
    alert_leads = [
        _hours(landfall.time, p.time)
        for p in case.track
        if p.wind_kt is not None and p.wind_kt >= ALERT_WIND_KT and p.time <= landfall.time
    ]
    activation_lead = max(alert_leads) if alert_leads else None

    errors: dict[int, float] = {}
    for lead in leads:
        cutoff = (_parse(landfall.time) - _dt.timedelta(hours=lead)).strftime("%Y-%m-%d %H:%M:%S")
        before = case.points_before(cutoff)
        if len(before) < 2:
            continue  # not enough pre-cutoff track to extrapolate
        plat, plon = extrapolate_landfall(before, landfall.time)
        errors[lead] = round(
            haversine(LatLon(plat, plon), LatLon(landfall.lat, landfall.lon)) / 1000.0, 1
        )
    maxw = max((p.wind_kt for p in case.track if p.wind_kt is not None), default=0.0)
    return StormScore(
        storm=case.storm,
        season=case.season,
        landfall_time=landfall.time,
        max_wind_kt=maxw,
        activation_lead_h=activation_lead,
        track_error_km=errors,
    )


def backtest_all(path: str = FIXTURE, leads: tuple[int, ...] = LEADS) -> dict:
    """Score EVERY committed IBTrACS storm; return per-storm + aggregate stats.

    The population statistic the two-storm hindcast couldn't give: across ~90 real
    cyclones, how much warning the activation rule buys and how far a naive
    persistence landfall-extrapolation lands from the real coast at each lead.
    """
    cases = load_ibtracs_cases(path)
    scores = [score_storm(c, leads) for c in cases]

    act = [s.activation_lead_h for s in scores if s.activation_lead_h is not None]
    agg_track = {}
    for lead in leads:
        errs = [s.track_error_km[lead] for s in scores if lead in s.track_error_km]
        if errs:
            agg_track[lead] = {
                "n": len(errs),
                "median_km": round(statistics.median(errs), 1),
                "mean_km": round(statistics.fmean(errs), 1),
            }
    return {
        "source": "NOAA IBTrACS v04r01 (North Indian Ocean), named landfalling storms",
        "n_storms": len(scores),
        "season_range": [min(s.season for s in scores), max(s.season for s in scores)],
        "activation": {
            "n_with_alert": len(act),
            "median_lead_h": round(statistics.median(act), 1) if act else None,
            "pct_alert_ge_48h": round(100 * sum(a >= 48 for a in act) / len(act), 1) if act else None,
            "pct_alert_ge_72h": round(100 * sum(a >= 72 for a in act) / len(act), 1) if act else None,
        },
        "track_extrapolation": agg_track,
        "storms": [s.to_dict() for s in scores],
    }


def to_markdown(report: dict) -> str:
    a = report["activation"]
    lines = [
        "# IBTrACS Multi-Cyclone Backtest (North Indian Ocean)",
        "",
        f"_{report['source']}_",
        "",
        f"- **{report['n_storms']} named landfalling cyclones**, "
        f"{report['season_range'][0]}-{report['season_range'][1]} "
        f"(vs the 2 hand-curated storms in the documented-outcome hindcast).",
        "",
        "## Activation lead time (when Module A would have triggered)",
        f"- Median warning before landfall (storm already a >=34 kt cyclone alert): "
        f"**{a['median_lead_h']} h**",
        f"- Storms with >=48 h alert lead: **{a['pct_alert_ge_48h']}%**  ·  "
        f">=72 h: **{a['pct_alert_ge_72h']}%**  (n={a['n_with_alert']})",
        "",
        "## Landfall track-extrapolation error (naive persistence — a floor, not IMD's model)",
        "| Forecast cutoff | Storms scored | Median error | Mean error |",
        "|---|---|---|---|",
    ]
    for lead in sorted(report["track_extrapolation"], key=int):
        t = report["track_extrapolation"][lead]
        lines.append(f"| {lead} h before landfall | {t['n']} | {t['median_km']} km | {t['mean_km']} km |")
    lines += [
        "",
        "## Honest scope",
        "- IBTrACS has tracks + intensity, NOT casualties/evacuation — so the bulk "
        "backtest scores activation lead time and landfall-extrapolation error only; "
        "the Fani/Amphan documented-outcome scoring stays in the full-pipeline backtest.",
        "- The extrapolation is naive great-circle persistence (a usefulness FLOOR); "
        "IMD's dynamical track forecast would do better in production.",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - network entry
    fetch_ibtracs()
    print("ibtracs: fixture written", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
