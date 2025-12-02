# knowlarity_sync.py
import os
import json
import datetime as dt
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Tuple

import requests
from supabase import create_client, Client
from dotenv import load_dotenv

# Load .env file if present (local dev)
# Try multiple locations: root directory and Backend directory
import pathlib
script_dir = pathlib.Path(__file__).parent.absolute()
env_loaded = False
for env_path in [script_dir / ".env", script_dir / "Backend" / ".env"]:
    if env_path.exists():
        load_dotenv(env_path)
        env_loaded = True
        break
if not env_loaded:
    # Still try default location (current working directory)
    load_dotenv()

# ----------------- Logging helper -----------------


def log(message: str) -> None:
    now = datetime.now(UTC).isoformat()
    print(f"[knowlarity-sync] {now} - {message}", flush=True)


# ----------------- ENV + CLIENT SETUP -----------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)

KNOWLARITY_API_URL = os.getenv(
    "KNOWLARITY_API_URL", "https://kpi.knowlarity.com/Basic/v1/account/calllog"
)
KNOWLARITY_API_KEY = os.getenv("KNOWLARITY_API_KEY")
KNOWLARITY_AUTH_TOKEN = os.getenv("KNOWLARITY_AUTH_TOKEN")
KNOWLARITY_CHANNEL = os.getenv("KNOWLARITY_CHANNEL", "Basic")

LOOKBACK_MINUTES = int(os.getenv("KNOWLARITY_SYNC_LOOKBACK_MINUTES", "15"))
PAGE_SIZE = int(os.getenv("KNOWLARITY_SYNC_PAGE_SIZE", "100"))

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/ROLE_KEY")

if not KNOWLARITY_API_KEY or not KNOWLARITY_AUTH_TOKEN:
    missing = []
    if not KNOWLARITY_API_KEY:
        missing.append("KNOWLARITY_API_KEY")
    if not KNOWLARITY_AUTH_TOKEN:
        missing.append("KNOWLARITY_AUTH_TOKEN")
    
    error_msg = (
        f"Missing {', '.join(missing)} in environment.\n"
        f"Please create a .env file in the root directory (Morris-Garages-CRM/.env) with:\n"
        f"  KNOWLARITY_API_KEY=your_api_key\n"
        f"  KNOWLARITY_AUTH_TOKEN=your_auth_token\n"
        f"\nTried loading .env from:\n"
        f"  - {script_dir / '.env'}\n"
        f"  - {script_dir / 'Backend' / '.env'}\n"
        f"  - Current working directory"
    )
    raise RuntimeError(error_msg)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ----------------- Knowlarity helpers -----------------


def format_knowlarity_date(date: dt.datetime) -> str:
    """YYYY-MM-DD HH:mm:ss as required by Knowlarity API."""
    return date.strftime("%Y-%m-%d %H:%M:%S")


def normalize_phone_keep_10_digits(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < 10:
        return None
    return digits[-10:]


def normalize_knowlarity_record(record: Dict[str, Any]) -> Dict[str, Any]:
    phone = record.get("customer_number") or record.get("caller_id") or None
    meta_date = record.get("start_time")
    meta_created_at = None
    if meta_date:
        try:
            d = dt.datetime.fromisoformat(str(meta_date).replace("Z", "+00:00"))
            meta_created_at = d.isoformat()
        except Exception:
            meta_created_at = None

    return {
        "platform": "Knowlarity",
        "name": f"Knowlarity Lead {phone}" if phone else "Knowlarity Lead",
        "phone_number": phone,
        "status": record.get("business_call_type") or "call",
        "meta_created_at": meta_created_at,
        "car_model": None,
        "lead_url": None,
        "payload": record,
    }


def fetch_knowlarity_page(
    start_time: dt.datetime,
    end_time: dt.datetime,
    limit: int,
    offset: int,
) -> Dict[str, Any]:
    url = KNOWLARITY_API_URL
    params = {
        "start_time": format_knowlarity_date(start_time),
        "end_time": format_knowlarity_date(end_time),
        "limit": str(limit),
        "offset": str(offset),
    }

    log(
        f"Requesting Knowlarity page: start={params['start_time']} end={params['end_time']} limit={limit} offset={offset}"
    )

    resp = requests.get(
        url,
        params=params,
        headers={
            "x-api-key": KNOWLARITY_API_KEY,
            "authorization": KNOWLARITY_AUTH_TOKEN,
            "channel": KNOWLARITY_CHANNEL,
        },
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(
            f"Knowlarity API error ({resp.status_code}): {resp.text}"
        )

    return resp.json()


# ----------------- Supabase helpers -----------------


def ensure_source_row() -> Dict[str, Any]:
    """
    Ensure there's a 'Knowlarity' / 'knowlarity_call' row in sources.
    Returns { id, total_leads_count, todays_leads_count }.
    """
    DISPLAY = "Knowlarity"
    TYPE = "knowlarity_call"

    log("Ensuring sources row for Knowlarity / knowlarity_call")

    resp = (
        supabase.table("sources")
        .select("id,total_leads_count,todays_leads_count")
        .eq("display_name", DISPLAY)
        .eq("source_type", TYPE)
        .execute()
    )

    if getattr(resp, "error", None):
        raise RuntimeError(f"Error reading sources: {getattr(resp, 'error', None)}")

    rows = resp.data or []
    if rows:
        row = rows[0]
        log(
            f"Found existing source row id={row['id']} total={row.get('total_leads_count')} today={row.get('todays_leads_count')}"
        )
        return {
            "id": row["id"],
            "total_leads_count": row.get("total_leads_count") or 0,
            "todays_leads_count": row.get("todays_leads_count") or 0,
        }

    log("Source row not found, inserting new Knowlarity source")
    ins = (
        supabase.table("sources")
        .insert(
            {
                "display_name": DISPLAY,
                "source_type": TYPE,
                "total_leads_count": 0,
                "todays_leads_count": 0,
            }
        )
        .execute()
    )

    if getattr(ins, "error", None):
        raise RuntimeError(f"Error inserting source row: {getattr(ins, 'error', None)}")

    inserted_rows = ins.data or []
    if not inserted_rows:
        raise RuntimeError("Insert into sources returned no rows")

    inserted = inserted_rows[0]
    log(
        f"Inserted new source row id={inserted['id']} total=0 today=0"
    )
    return {
        "id": inserted["id"],
        "total_leads_count": inserted.get("total_leads_count") or 0,
        "todays_leads_count": inserted.get("todays_leads_count") or 0,
    }


def update_source_counts(
    source_id: int, inc_total: int, inc_today: int
) -> Tuple[int, int]:
    log(
        f"Updating source counts for source_id={source_id} inc_total={inc_total} inc_today={inc_today}"
    )

    resp = (
        supabase.table("sources")
        .select("total_leads_count,todays_leads_count")
        .eq("id", source_id)
        .execute()
    )

    if getattr(resp, "error", None):
        raise RuntimeError(f"Error reading source counts: {getattr(resp, 'error', None)}")

    rows = resp.data or []
    row = rows[0] if rows else {}

    new_total = (row.get("total_leads_count") or 0) + inc_total
    new_today = (row.get("todays_leads_count") or 0) + inc_today

    upd = (
        supabase.table("sources")
        .update(
            {
                "total_leads_count": new_total,
                "todays_leads_count": new_today,
            }
        )
        .eq("id", source_id)
        .execute()
    )

    if getattr(upd, "error", None):
        raise RuntimeError(f"Error updating source counts: {getattr(upd, 'error', None)}")

    log(
        f"Source counts updated for source_id={source_id}: total={new_total} today={new_today}"
    )
    return new_total, new_today


# ----------------- MAIN SYNC LOGIC -----------------


def sync_knowlarity_calls(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
) -> Dict[str, Any]:
    """
    New flow (same logic as Meta new flow):

    For each Knowlarity record:
      1. Normalize phone (last 10 digits)
      2. Ensure Knowlarity source row exists (Knowlarity / knowlarity_call)
      3. Check leads_master by phone_number_normalized:
         - Case A (no existing lead): insert into leads_master (status='Pending'), no history
         - Case B (all existing leads source_id == knowlarity source): skip completely
         - Case C (some existing lead has different source_id):
               insert into lead_sources_history (no new lead)
      4. Update sources.total_leads_count / todays_leads_count
    """

    log("Starting Knowlarity sync")

    now = dt.datetime.fromisoformat(end_time) if end_time else dt.datetime.utcnow()
    if start_time:
        start_dt = dt.datetime.fromisoformat(start_time)
    else:
        start_dt = now - dt.timedelta(minutes=LOOKBACK_MINUTES)

    log(
        f"Effective time window start={start_dt.isoformat()} end={now.isoformat()}"
    )

    per_page = limit if limit and limit > 0 else PAGE_SIZE
    current_offset = offset or 0

    # Ensure we have a source row
    source_row = ensure_source_row()
    source_id = source_row["id"]

    today_iso = datetime.now(UTC).strftime("%Y-%m-%d")

    summary = {
        "startTime": start_dt.isoformat(),
        "endTime": now.isoformat(),
        "processedRecords": 0,
        "insertedNew": 0,
        "crossSourceHistory": 0,
        "duplicateSameSource": 0,
        "skippedNoPhone": 0,
        "errors": [],
        "details": [],
    }

    inc_total = 0
    inc_today = 0

    has_more = True

    while has_more:
        try:
            page = fetch_knowlarity_page(
                start_dt,
                now,
                per_page,
                current_offset,
            )
        except Exception as e:
            log(f"Error fetching page at offset={current_offset}: {e}")
            summary["errors"].append(
                {"offset": current_offset, "error": str(e)}
            )
            break

        records = page.get("objects") or []
        meta = page.get("meta") or {}
        total_count = meta.get("total_count")

        log(
            f"Fetched {len(records)} records at offset={current_offset}, total_count={total_count}"
        )

        if not records:
            has_more = False
            break

        for record in records:
            summary["processedRecords"] += 1
            try:
                normalized_payload = normalize_knowlarity_record(record)
                raw_phone = normalized_payload["phone_number"]
                normalized_phone = normalize_phone_keep_10_digits(raw_phone)

                if not normalized_phone:
                    log(
                        f"Skipping record (no valid phone). raw_phone={raw_phone} uuid={record.get('uuid')}"
                    )
                    summary["skippedNoPhone"] += 1
                    summary["details"].append(
                        {
                            "uuid": record.get("uuid"),
                            "reason": "missing_or_invalid_phone",
                            "rawPhone": raw_phone,
                        }
                    )
                    continue

                name = normalized_payload["name"] or f"Knowlarity Lead {normalized_phone}"

                # determine if this record is from 'today' (optional)
                created_iso = None
                if normalized_payload.get("meta_created_at"):
                    try:
                        created_dt = dt.datetime.fromisoformat(
                            normalized_payload["meta_created_at"].replace("Z", "+00:00")
                        )
                        created_iso = created_dt.date().isoformat()
                    except Exception:
                        created_iso = None
                is_today = 1 if created_iso == today_iso else 0

                # duplicate check
                existing_resp = (
                    supabase.table("leads_master")
                    .select("id, source_id, created_at")
                    .eq("phone_number_normalized", normalized_phone)
                    .execute()
                )

                if getattr(existing_resp, "error", None):
                    err = getattr(existing_resp, "error", None)
                    log(
                        f"Error checking duplicates for phone={normalized_phone}: {err}"
                    )
                    summary["errors"].append(
                        {
                            "uuid": record.get("uuid"),
                            "error": str(err),
                        }
                    )
                    continue

                existing_leads = existing_resp.data or []

                if not existing_leads:
                    # Case A: new lead
                    log(
                        f"Inserting NEW Knowlarity lead uuid={record.get('uuid')} phone={normalized_phone}"
                    )

                    insert_payload = {
                        "full_name": name,
                        "phone_number_normalized": normalized_phone,
                        "alternate_phone_number": None,
                        "source_id": source_id,
                        "external_lead_id": str(record.get("uuid"))
                        if record.get("uuid")
                        else None,
                        "assigned_to": None,
                        "status": "New",
                        "next_followup_at": None,
                        "total_attempts": 0,
                        "is_qualified": False,
                        "raw_payload": record,
                    }

                    ins = (
                        supabase.table("leads_master")
                        .insert(insert_payload)
                        .execute()
                    )
                    if getattr(ins, "error", None):
                        log(
                            f"Error inserting lead for phone={normalized_phone}: {getattr(ins, 'error', None)}"
                        )
                        summary["errors"].append(
                            {
                                "uuid": record.get("uuid"),
                                "error": str(getattr(ins, "error", None)),
                            }
                        )
                        continue

                    summary["insertedNew"] += 1
                    inc_total += 1
                    inc_today += is_today

                else:
                    # Some leads already exist
                    cross_source = [
                        row for row in existing_leads if row.get("source_id") != source_id
                    ]

                    if cross_source:
                        # Case C: cross-source duplicate -> lead_sources_history only
                        # Choose the most recent by created_at
                        def _ts(row: Dict[str, Any]) -> float:
                            ts = row.get("created_at")
                            if not ts:
                                return 0.0
                            try:
                                return dt.datetime.fromisoformat(
                                    ts.replace("Z", "+00:00")
                                ).timestamp()
                            except Exception:
                                return 0.0

                        chosen = sorted(cross_source, key=_ts, reverse=True)[0]

                        log(
                            f"Cross-source DUP: phone={normalized_phone} existing_lead_id={chosen['id']} uuid={record.get('uuid')}"
                        )

                        hist_payload = {
                            "lead_id": chosen["id"],
                            "source_id": source_id,
                            "external_id": str(record.get("uuid"))
                            if record.get("uuid")
                            else None,
                            "raw_payload": record,
                            "received_at": datetime.now(UTC).isoformat() + "Z",
                            "is_primary": False,
                        }

                        hist_res = (
                            supabase.table("lead_sources_history")
                            .insert(hist_payload)
                            .execute()
                        )
                        if getattr(hist_res, "error", None):
                            log(
                                f"Error inserting lead_sources_history for phone={normalized_phone}: {getattr(hist_res, 'error', None)}"
                            )
                            summary["errors"].append(
                                {
                                    "uuid": record.get("uuid"),
                                    "error": str(getattr(hist_res, "error", None)),
                                }
                            )
                            continue

                        summary["crossSourceHistory"] += 1
                        inc_total += 1
                        inc_today += is_today

                    else:
                        # Case B: same-source duplicate: already in leads_master from Knowlarity
                        log(
                            f"Same-source duplicate (Knowlarity) for phone={normalized_phone}; skipping."
                        )
                        summary["duplicateSameSource"] += 1

            except Exception as rec_err:
                log(
                    f"Error processing Knowlarity record uuid={record.get('uuid')}: {rec_err}"
                )
                summary["errors"].append(
                    {
                        "uuid": record.get("uuid"),
                        "error": str(rec_err),
                    }
                )

        current_offset += len(records)

        if not records or (total_count is not None and current_offset >= total_count):
            has_more = False

    # Update source counters
    try:
        if inc_total > 0 or inc_today > 0:
            update_source_counts(source_id, inc_total, inc_today)
    except Exception as e:
        log(f"Error updating source counts: {e}")
        summary["errors"].append(
            {
                "error": "updating source counts",
                "details": str(e),
            }
        )

    log("Knowlarity sync finished")
    return {
        "success": True,
        "summary": summary,
    }


# ----------------- CLI ENTRYPOINT -----------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Sync Knowlarity calls into Supabase leads_master with dedupe logic."
    )
    parser.add_argument(
        "--start-time",
        help="ISO datetime (UTC) to start fetching from. If omitted, defaults to now - LOOKBACK_MINUTES.",
    )
    parser.add_argument(
        "--end-time",
        help="ISO datetime (UTC) to stop fetching at. If omitted, defaults to now.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Page size for Knowlarity API (default from KNOWLARITY_SYNC_PAGE_SIZE).",
    )
    parser.add_argument(
        "--offset",
        type=int,
        help="Initial offset for Knowlarity API.",
    )

    args = parser.parse_args()

    log("Starting CLI Knowlarity sync run")
    result = sync_knowlarity_calls(
        start_time=args.start_time,
        end_time=args.end_time,
        limit=args.limit,
        offset=args.offset,
    )
    log("Knowlarity sync completed, printing JSON summary")
    print(json.dumps(result, indent=2), flush=True)
