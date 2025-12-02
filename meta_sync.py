# meta_sync.py
import os
import json
import logging
import datetime
from typing import Any, Dict, List, Optional, Tuple, Generator

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import timezone

# ----------------- ENV + CLIENT SETUP -----------------

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

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v20.0")
META_API_BASE = f"https://graph.facebook.com/{META_GRAPH_VERSION}"

# Strip whitespace from environment variables to prevent API errors
META_PAGE_ID = os.getenv("META_PAGE_ID", "").strip() or None
META_PAGE_ACCESS_TOKEN = os.getenv("META_PAGE_ACCESS_TOKEN", "").strip() or None

# Default to 24 hours ago if not specified in environment
# Treat empty strings as None to ensure 24-hour default works
META_MIN_CREATED_AT = os.getenv("META_MIN_CREATED_AT", "").strip() or None
META_SYNC_SINCE_OVERRIDE = os.getenv("META_SYNC_SINCE_OVERRIDE", "").strip() or None

# MIN_ACCEPTED_DATE will be calculated dynamically in sync_meta_leads
# to ensure it's always 24 hours ago when the script runs
MIN_ACCEPTED_DATE = None

AUTO_SENTINEL = "AUTO"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.")

if not META_PAGE_ID or not META_PAGE_ACCESS_TOKEN:
    raise RuntimeError("Missing META_PAGE_ID or META_PAGE_ACCESS_TOKEN in environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ----------------- LOGGING -----------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


# ----------------- META HELPERS -----------------

def get_session() -> requests.Session:
    """Return a requests.Session with retry logic."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS", "GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def handle_requests_error(e: Exception, context: str) -> None:
    raise RuntimeError(f"{context} failed: {e}")


def fetch_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params = params or {}
    session = get_session()
    try:
        resp = session.get(url, params=params, timeout=60)
        if not resp.ok:
            error_text = resp.text
            # Try to parse error message for better logging
            try:
                error_json = resp.json()
                if "error" in error_json:
                    error_msg = error_json["error"].get("message", error_text)
                    error_code = error_json["error"].get("code", resp.status_code)
                    raise RuntimeError(
                        f"Meta Graph API error ({error_code}): {error_msg}\n"
                        f"URL: {url}\n"
                        f"Check that META_PAGE_ID and META_PAGE_ACCESS_TOKEN are correct and have proper permissions."
                    )
            except Exception:
                pass
            raise RuntimeError(f"Fetch failed {url} ({resp.status_code}): {error_text}")
        return resp.json()
    finally:
        session.close()


def require_env(name: str, value: Optional[str]) -> str:
    if not value:
        raise RuntimeError(
            f"{name} is required for Meta lead sync but was not found in the environment."
        )
    return value


def parse_form_ids(
    body_form_ids: Optional[List[str]],
    env_form_ids: Optional[str],
) -> Tuple[List[str], bool]:
    """
    Build the form ID list from:
      - CLI/explicit IDs (body_form_ids)
      - META_FORM_IDS_DEFAULT (comma separated)
    If after that the list is still empty -> auto discovery from META_PAGE_ID.
    """
    merged: set[str] = set()

    if body_form_ids:
        for fid in body_form_ids:
            if isinstance(fid, str):
                trimmed = fid.strip()
                if trimmed:
                    merged.add(trimmed)

    if env_form_ids and env_form_ids.strip():
        for fid in env_form_ids.split(","):
            trimmed = fid.strip()
            if trimmed:
                merged.add(trimmed)

    unique = [fid for fid in merged if fid.isdigit()]
    auto_requested = len(unique) == 0  # if none specified → auto discover
    return unique, auto_requested


def fetch_lead_forms(page_id: str, access_token: str) -> List[Dict[str, Any]]:
    # Strip whitespace to prevent API errors
    page_id = page_id.strip() if page_id else ""
    access_token = access_token.strip() if access_token else ""
    
    if not page_id or not access_token:
        raise RuntimeError("META_PAGE_ID and META_PAGE_ACCESS_TOKEN must be non-empty")
    
    url = f"{META_API_BASE}/{page_id}/leadgen_forms"
    forms: List[Dict[str, Any]] = []
    next_url: Optional[str] = url
    params: Dict[str, Any] = {"access_token": access_token, "limit": 100}

    while next_url:
        data = fetch_json(next_url, params)
        if isinstance(data.get("data"), list):
            forms.extend(data["data"])
        if data.get("paging", {}).get("next"):
            next_url = data["paging"]["next"]
            params = {}
        else:
            next_url = None

    # Only ACTIVE forms
    return [f for f in forms if f.get("status") == "ACTIVE"]


def build_filtering_param(since: Optional[str], until: Optional[str]) -> Optional[str]:
    filters = []
    if since:
        try:
            dt = datetime.datetime.fromisoformat(since.replace("Z", "+00:00"))
            filters.append(
                {
                    "field": "time_created",
                    "operator": "GREATER_THAN",
                    "value": int(dt.timestamp()),
                }
            )
        except Exception:
            pass

    if until:
        try:
            dt = datetime.datetime.fromisoformat(until.replace("Z", "+00:00"))
            filters.append(
                {
                    "field": "time_created",
                    "operator": "LESS_THAN",
                    "value": int(dt.timestamp()),
                }
            )
        except Exception:
            pass

    return json.dumps(filters) if filters else None


def fetch_leads_for_form_stream(
    form_id: str,
    access_token: str,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """
    Stream leads page by page, yielding one lead at a time.
    """
    # Strip whitespace to prevent API errors
    form_id = form_id.strip() if form_id else ""
    access_token = access_token.strip() if access_token else ""
    
    if not form_id or not access_token:
        raise RuntimeError("form_id and access_token must be non-empty")
    
    if limit is None or limit <= 0:
        limit = 100

    base = f"{META_API_BASE}/{form_id}/leads"
    next_url: Optional[str] = base
    filtering = build_filtering_param(since, until)

    query: Dict[str, Any] = {
        "access_token": access_token,
        "limit": limit,
    }
    if filtering:
        query["filtering"] = filtering

    while next_url:
        data = fetch_json(next_url, query)
        if isinstance(data.get("data"), list):
            for lead in data["data"]:
                yield lead

        if data.get("paging", {}).get("next"):
            next_url = data["paging"]["next"]
            query = {}  # next URL already has params
        else:
            next_url = None


def extract_field(fields: Dict[str, Any], name_list: List[str]) -> Optional[str]:
    for name in name_list:
        if fields.get(name):
            return str(fields[name])
    return None


def fields_map_from_lead(raw_lead: Dict[str, Any]) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    for entry in raw_lead.get("field_data", []) or []:
        key = entry.get("name")
        values = entry.get("values", [])
        value = values[0] if isinstance(values, list) and values else values
        if key:
            fields[key] = value
    return fields


def extract_name(fields: Dict[str, Any]) -> Optional[str]:
    full_name = extract_field(fields, ["full_name", "name"])
    if full_name:
        return full_name

    first = extract_field(fields, ["first_name"]) or ""
    last = extract_field(fields, ["last_name"]) or ""
    if first or last:
        return f"{first} {last}".strip()
    return None


def extract_phone_from_fields(fields: Dict[str, Any]) -> Optional[str]:
    return extract_field(
        fields,
        [
            "phone_number",
            "phone",
            "mobile_phone",
            "mobile",
            "phone_number_with_country_code",
        ],
    )


def normalize_phone_keep_10_digits(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < 10:
        return None
    return digits[-10:]


# ----------------- DB HELPERS -----------------


def ensure_source_row() -> Dict[str, Any]:
    DISPLAY = "Meta"
    TYPE = "meta_form"

    resp = (
        supabase.table("sources")
        .select("id,total_leads_count,todays_leads_count")
        .eq("display_name", DISPLAY)
        .eq("source_type", TYPE)
        .execute()
    )
    if getattr(resp, "error", None):
        raise RuntimeError(f"Error reading sources: {resp.error}")

    rows = resp.data or []
    if rows:
        row = rows[0]
        return {
            "id": row["id"],
            "total_leads_count": row.get("total_leads_count") or 0,
            "todays_leads_count": row.get("todays_leads_count") or 0,
        }

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
        raise RuntimeError(f"Error inserting source row: {ins.error}")

    inserted_rows = ins.data or []
    if not inserted_rows:
        raise RuntimeError("Insert into sources returned no rows")

    inserted = inserted_rows[0]
    return {
        "id": inserted["id"],
        "total_leads_count": inserted.get("total_leads_count") or 0,
        "todays_leads_count": inserted.get("todays_leads_count") or 0,
    }


def update_source_counts(source_id: int, inc_total: int, inc_today: int) -> None:
    """Increment total_leads_count and todays_leads_count."""
    if inc_total == 0 and inc_today == 0:
        return

    resp = (
        supabase.table("sources")
        .select("total_leads_count,todays_leads_count")
        .eq("id", source_id)
        .execute()
    )
    if getattr(resp, "error", None):
        raise RuntimeError(f"Error reading source counts: {resp.error}")

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
        raise RuntimeError(f"Error updating source counts: {upd.error}")


# ----------------- MAIN SYNC LOGIC -----------------

def sync_meta_leads(
    form_ids: Optional[List[str]] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Python implementation of your Node syncMetaLeads, but using the new phone-based
    flow + sources/leads_master/lead_sources_history rules you described.
    """

    # Strip whitespace and validate
    access_token = require_env("META_PAGE_ACCESS_TOKEN", META_PAGE_ACCESS_TOKEN)
    if access_token:
        access_token = access_token.strip()
    
    page_id = require_env("META_PAGE_ID", META_PAGE_ID)
    if page_id:
        page_id = page_id.strip()

    env_form_ids = os.getenv("META_FORM_IDS_DEFAULT", None)
    configured_form_ids, auto_requested = parse_form_ids(form_ids, env_form_ids)

    sync_summary: Dict[str, Any] = {
        "formsProcessed": 0,
        "leadsChecked": 0,
        "leadsInsertedNew": 0,
        "leadsCrossSourceHistory": 0,
        "leadsDuplicateSameSource": 0,
        "leadsSkippedInvalidPhoneOrDate": 0,
        "autoDiscoveredForms": 0,
        "details": [],
        "errors": [],
    }

    now = datetime.datetime.now(timezone.utc)
    month_start = datetime.datetime(
        year=now.year, month=now.month, day=1, tzinfo=timezone.utc
    ).isoformat()

    # Calculate default: 24 hours ago if no override is provided
    if not since and not META_SYNC_SINCE_OVERRIDE and not META_MIN_CREATED_AT:
        # Default to 24 hours ago
        twenty_four_hours_ago = now - datetime.timedelta(hours=24)
        effective_since = twenty_four_hours_ago.isoformat()
        logging.info("No META_MIN_CREATED_AT or override specified, defaulting to past 24 hours")
    else:
        effective_since = since or META_SYNC_SINCE_OVERRIDE or META_MIN_CREATED_AT

    # Calculate min_accepted_date from effective_since for filtering
    try:
        min_accepted_date = datetime.datetime.fromisoformat(
            effective_since.replace("Z", "+00:00")
        )
    except Exception:
        # Fallback to 24 hours ago if parsing fails
        min_accepted_date = now - datetime.timedelta(hours=24)
        logging.warning(f"Failed to parse effective_since '{effective_since}', using 24 hours ago as fallback")

    logging.info(f"Filtering leads from: {effective_since} (min_accepted_date: {min_accepted_date.isoformat()})")

    # 1) ensure source row
    source_row = ensure_source_row()
    source_id = source_row["id"]
    logging.info(f"Meta source ID: {source_id}")

    # 2) resolve forms & metadata
    resolved_form_ids = configured_form_ids
    form_metadata: List[Dict[str, Any]] = []

    if not resolved_form_ids or auto_requested:
        forms = fetch_lead_forms(page_id, access_token)
        resolved_form_ids = [f["id"] for f in forms]
        form_metadata = forms
        sync_summary["autoDiscoveredForms"] = len(resolved_form_ids)
    else:
        resolved_set = set(resolved_form_ids)
        form_metadata = [{"id": fid} for fid in resolved_form_ids]
        auto_forms = set()

        if not resolved_set or auto_requested:
            auto_form_data = fetch_lead_forms(page_id, access_token)
            for f in auto_form_data:
                resolved_set.add(f["id"])
                auto_forms.add(f["id"])

        resolved_form_ids = list(resolved_set)
        sync_summary["autoDiscoveredForms"] = len(auto_forms)
        form_metadata = [{"id": fid} for fid in resolved_form_ids]

    if not resolved_form_ids:
        sync_summary["message"] = (
            "No lead forms found. Meta returned zero active forms. "
            "Confirm page access and permissions."
        )
        return sync_summary

    sync_summary["formsProcessed"] = len(resolved_form_ids)

    today_iso = now.date().isoformat()

    # 3) process forms & leads
    for meta in form_metadata:
        form_id = meta["id"]
        logging.info(f"Processing form {form_id}...")

        try:
            lead_stream = fetch_leads_for_form_stream(
                form_id, access_token, since=effective_since, until=until, limit=limit
            )
        except Exception as e:
            sync_summary["errors"].append({"formId": form_id, "error": str(e)})
            continue

        for raw_lead in lead_stream:
            sync_summary["leadsChecked"] += 1

            lead_created_time_str = raw_lead.get("created_time")
            if lead_created_time_str:
                try:
                    created_dt = datetime.datetime.fromisoformat(
                        lead_created_time_str.replace("Z", "+00:00")
                    )
                except Exception:
                    created_dt = None
            else:
                created_dt = None

            # skip if before min_accepted_date
            if created_dt and created_dt < min_accepted_date:
                sync_summary["leadsSkippedInvalidPhoneOrDate"] += 1
                sync_summary["details"].append(
                    {
                        "formId": form_id,
                        "leadId": raw_lead.get("id"),
                        "reason": "Lead before minimum accepted date",
                    }
                )
                continue

            fields = fields_map_from_lead(raw_lead)
            raw_phone = extract_phone_from_fields(fields)
            normalized = normalize_phone_keep_10_digits(raw_phone)

            if not normalized:
                sync_summary["leadsSkippedInvalidPhoneOrDate"] += 1
                sync_summary["details"].append(
                    {
                        "formId": form_id,
                        "leadId": raw_lead.get("id"),
                        "reason": "Missing or invalid phone",
                        "rawPhone": raw_phone,
                    }
                )
                continue

            name = extract_name(fields) or f"Meta Lead {normalized}"

            created_date_iso = created_dt.date().isoformat() if created_dt else None
            is_today = 1 if created_date_iso == today_iso else 0

            # DUP CHECK by phone_number_normalized
            existing_resp = (
                supabase.table("leads_master")
                .select("id, source_id, created_at")
                .eq("phone_number_normalized", normalized)
                .execute()
            )
            if getattr(existing_resp, "error", None):
                sync_summary["errors"].append(
                    {
                        "formId": form_id,
                        "leadId": raw_lead.get("id"),
                        "error": str(existing_resp.error),
                    }
                )
                continue

            existing_leads = existing_resp.data or []

            if not existing_leads:
                # Case A — new phone → insert into leads_master
                insert_payload = {
                    "full_name": name,
                    "phone_number_normalized": normalized,
                    "alternate_phone_number": None,
                    "source_id": source_id,
                    "external_lead_id": raw_lead.get("id"),
                    "assigned_to": None,
                    "status": "New",
                    "next_followup_at": None,
                    "total_attempts": 0,
                    "is_qualified": False,
                    "raw_payload": raw_lead,
                }
                ins = supabase.table("leads_master").insert(insert_payload).execute()
                if getattr(ins, "error", None):
                    sync_summary["errors"].append(
                        {
                            "formId": form_id,
                            "leadId": raw_lead.get("id"),
                            "error": str(getattr(ins, "error", None)),
                        }
                    )
                    continue

                sync_summary["leadsInsertedNew"] += 1
                try:
                    update_source_counts(source_id, 1, is_today)
                except Exception as e:
                    logging.warning(f"Failed updating source counts: {e}")

            else:
                # Some leads already exist for this phone
                different_source_leads = [
                    row for row in existing_leads if row.get("source_id") != source_id
                ]

                if different_source_leads:
                    # Case C — cross-source duplicate → only lead_sources_history row
                    # pick most recent by created_at
                    def _ts(row: Dict[str, Any]) -> float:
                        ts = row.get("created_at")
                        if not ts:
                            return 0.0
                        try:
                            return datetime.datetime.fromisoformat(
                                ts.replace("Z", "+00:00")
                            ).timestamp()
                        except Exception:
                            return 0.0

                    chosen = sorted(different_source_leads, key=_ts, reverse=True)[0]

                    hist_payload = {
                        "lead_id": chosen["id"],
                        "source_id": source_id,
                        "external_id": raw_lead.get("id"),
                        "raw_payload": raw_lead,
                        "received_at": datetime.datetime.now(timezone.utc).isoformat(),
                        "is_primary": False,
                    }

                    hist_res = (
                        supabase.table("lead_sources_history")
                        .insert(hist_payload)
                        .execute()
                    )
                    if getattr(hist_res, "error", None):
                        sync_summary["errors"].append(
                            {
                                "formId": form_id,
                                "leadId": raw_lead.get("id"),
                                "error": str(hist_res.error),
                            }
                        )
                        continue

                    sync_summary["leadsCrossSourceHistory"] += 1
                    try:
                        update_source_counts(source_id, 1, is_today)
                    except Exception as e:
                        logging.warning(f"Failed updating source counts: {e}")
                else:
                    # Case B — same-source duplicate; skip
                    sync_summary["leadsDuplicateSameSource"] += 1

    sync_summary["message"] = "Meta lead sync completed."

    return sync_summary


# ----------------- CLI ENTRYPOINT -----------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Sync Meta leads into Supabase.")
    parser.add_argument(
        "--since",
        help="ISO timestamp (UTC) to fetch leads created after this time. "
        "If omitted, uses META_MIN_CREATED_AT logic.",
    )
    parser.add_argument(
        "--until",
        help="ISO timestamp (UTC) to fetch leads created before this time.",
    )
    parser.add_argument(
        "--form-id",
        action="append",
        help="Meta lead form ID. Can be passed multiple times. "
        "If omitted, uses env META_FORM_IDS_DEFAULT + auto discovery from META_PAGE_ID.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Per-page limit when fetching leads (default=100)",
    )

    args = parser.parse_args()

    result = sync_meta_leads(
        form_ids=args.form_id,
        since=args.since,
        until=args.until,
        limit=args.limit,
    )
    print(json.dumps(result, indent=2))
