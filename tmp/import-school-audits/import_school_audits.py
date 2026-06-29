#!/usr/bin/env python
"""
Import historical Rayyan and Rhythms school audit ledgers into the Ops Hub tables.

Default mode is a dry-run that writes normalized JSON payloads and a summary. Use
--apply only when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAYYAN = Path(r"C:\Users\Administrator\Downloads\AR-RAYYAN DAYCARE AND PLAYHOUSE AUDIT (2024-MARCH 2026).xlsx")
DEFAULT_RHYTHMS = Path(r"C:\Users\Administrator\Downloads\RHYTHMS COLLEGE-ALL DEPARTMENTS  RECORDS.xlsx")
OUTPUT_DIR = ROOT / "tmp" / "import-school-audits" / "outputs"

RAYYAN_DEBT_SHEETS = {"DAYCARE DEBTORS", "PLAYHOUSE DEBTORS"}
RHYTHMS_DEBT_SHEETS = {
    "COMPUTER STUDIES DEBTS",
    "MUSIC DEBTS",
    "MUSIC PRACTICE DEBTS",
    "ACCOUNTS DEBTS",
}


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    text = str(value).strip()
    return "" if text.lower() == "nan" else re.sub(r"\s+", " ", text)


def money(value: Any) -> float:
    text = clean(value)
    if not text or text.upper() in {"N/A", "NA", "-", "NO RECORDS OF THIS STUDENT IN THE LEDGER"}:
        return 0.0
    if isinstance(value, (int, float)) and not (isinstance(value, float) and math.isnan(value)):
        return float(value)
    text = text.replace(",", "").replace("KSH", "").replace("Ksh", "").strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def iso_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = clean(value)
    if not text:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return text
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def status_from_balance(expected: float, paid: float, balance: float | None = None) -> str:
    bal = expected - paid if balance is None else balance
    if expected <= 0 and paid > 0:
        return "credit"
    if bal <= 0:
        return "paid"
    if paid > 0:
        return "partial"
    return "unpaid"


def normalize_status(text: str) -> str:
    t = text.lower()
    if not t:
        return "historical"
    if "transfer" in t or "went to" in t or "former" in t:
        return "transferred"
    if "enrolled" in t or "active" in t:
        return "enrolled"
    if "complete" in t or "done" in t or "issued" in t:
        return "completed"
    return text[:80]


def term_from_date(value: Any) -> str:
    d = iso_date(value)
    if not d:
        return ""
    year, month = int(d[:4]), int(d[5:7])
    if month <= 4:
        return f"Term 1 {year}"
    if month <= 8:
        return f"Term 2 {year}"
    return f"Term 3 {year}"


def first_nonempty(*values: Any) -> str:
    for value in values:
        text = clean(value)
        if text:
            return text
    return ""


def dedupe_key(*parts: Any) -> str:
    return "|".join(clean(p).upper() for p in parts)


def add_unique(bucket: dict[str, dict[str, Any]], key: str, row: dict[str, Any]) -> None:
    if key not in bucket:
        bucket[key] = row
        return
    existing = bucket[key]
    for field, value in row.items():
        if value in ("", None, [], {}):
            continue
        if existing.get(field) in ("", None, [], {}):
            existing[field] = value
        elif field == "notes" and value and value not in existing[field]:
            existing[field] = f"{existing[field]}; {value}"


def read_sheet(path: Path, sheet: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=sheet, dtype=object)


def source_note(workbook: str, sheet: str, extra: str = "") -> str:
    return f"Imported from {workbook} / {sheet}{(': ' + extra) if extra else ''}"


def parse_rayyan(path: Path) -> dict[str, list[dict[str, Any]]]:
    xls = pd.ExcelFile(path)
    students: dict[str, dict[str, Any]] = {}
    invoices: list[dict[str, Any]] = []
    payments: list[dict[str, Any]] = []
    followups: list[dict[str, Any]] = []

    student_status: dict[str, str] = {}
    for sheet in RAYYAN_DEBT_SHEETS & set(xls.sheet_names):
        df = read_sheet(path, sheet)
        current_adm = ""
        current_name = ""
        for _, row in df.iterrows():
            raw_adm = first_nonempty(row.get("ADM NO"), row.get("ADM"))
            raw_name = clean(row.get("NAME"))
            if raw_adm:
                current_adm = raw_adm
            if raw_name and raw_name.upper() not in {"TRANSFERRED", "TOTAL"}:
                current_name = raw_name
            if not current_adm or not current_name:
                continue
            status = clean(row.get("STATUS"))
            if status:
                student_status[current_adm] = status
            details = clean(row.get("DETAILS"))
            amount = 0.0
            for col, value in row.items():
                col_text = clean(col).upper()
                if col_text in {"AMOUNT", "AMOUNT "} or col_text.startswith("STUDENT BALANCES") or col_text.startswith("UNNAMED"):
                    amount += money(value)
            class_level = "Daycare" if "DAYCARE" in sheet else "Playhouse"
            add_unique(
                students,
                dedupe_key(current_adm, current_name),
                {
                    "full_name": current_name,
                    "admission_number": current_adm,
                    "schoolpay_code": "",
                    "class_level": class_level,
                    "enrollment_status": normalize_status(status),
                    "start_date": None,
                    "notes": source_note(path.name, sheet, clean(row.get("NOTES"))),
                },
            )
            if amount != 0:
                followups.append(
                    {
                        "student_lookup": {"admission_number": current_adm, "full_name": current_name},
                        "schoolpay_code": "",
                        "expected_fee_item": details or "Outstanding balance",
                        "follow_up_status": "pending" if amount > 0 else "credit",
                        "last_known_fee_status": f"Balance KSh {amount:g}",
                        "next_follow_up_date": None,
                        "notes": source_note(path.name, sheet, f"status={status}; notes={clean(row.get('NOTES'))}"),
                    }
                )

    for sheet in [s for s in xls.sheet_names if s not in RAYYAN_DEBT_SHEETS]:
        df = read_sheet(path, sheet)
        current_adm = ""
        current_name = ""
        current_class = "Daycare" if "DAYCARE" in sheet else "Playhouse"
        for index, row in df.iterrows():
            raw_adm = first_nonempty(row.get("ADM NO"), row.get("ADM"))
            raw_name = clean(row.get("NAME"))
            if raw_adm:
                current_adm = raw_adm
            if raw_adm and raw_name and raw_name.upper() not in {"TRANSFERRED", "TOTAL"}:
                current_name = raw_name
            if not current_adm or not current_name:
                continue

            add_unique(
                students,
                dedupe_key(current_adm, current_name),
                {
                    "full_name": current_name,
                    "admission_number": current_adm,
                    "schoolpay_code": "",
                    "class_level": current_class,
                    "enrollment_status": normalize_status(student_status.get(current_adm, "")),
                    "start_date": iso_date(row.get("DATE")),
                    "notes": source_note(path.name, sheet),
                },
            )

            details = first_nonempty(row.get("DETAILS"), row.get("CATEGORY"))
            if not details or details.upper().startswith("TOTAL"):
                continue
            dr = money(row.get("DR") if "DR" in row else row.get("Dr"))
            cr = money(row.get("CR") if "CR" in row else row.get("Cr"))
            bal = money(row.get("BALANCE"))
            if dr == 0 and cr == 0:
                continue
            paid_on = iso_date(row.get("DATE"))
            term = first_nonempty(row.get("TERM"), term_from_date(row.get("DATE")))
            fee_item = first_nonempty(row.get("CATEGORY"), details, sheet.title())
            invoice_key = dedupe_key(current_adm, sheet, index, paid_on, details, dr, cr)
            invoices.append(
                {
                    "import_key": invoice_key,
                    "student_lookup": {"admission_number": current_adm, "full_name": current_name},
                    "schoolpay_code": "",
                    "fee_item": fee_item,
                    "term": term,
                    "amount_expected_ksh": dr,
                    "amount_paid_ksh": cr,
                    "status": status_from_balance(dr, cr, bal),
                    "due_date": paid_on,
                    "notes": source_note(path.name, sheet, f"details={details}; receipt={clean(row.get('RCT NO'))}"),
                }
            )
            if cr > 0:
                payments.append(
                    {
                        "invoice_import_key": invoice_key,
                        "student_lookup": {"admission_number": current_adm, "full_name": current_name},
                        "amount_ksh": cr,
                        "method": "mpesa" if clean(row.get("MPESA TRANSACTION CODE")) else "manual",
                        "reference": first_nonempty(row.get("MPESA TRANSACTION CODE"), row.get("RCT NO")),
                        "paid_on": paid_on or "2026-03-31",
                        "recorded_by": "historical-import",
                        "notes": source_note(path.name, sheet, f"details={details}; balance={bal:g}"),
                    }
                )

    return {
        "students": list(students.values()),
        "invoices": invoices,
        "payments": payments,
        "followups": followups,
    }


def parse_rhythms(path: Path) -> dict[str, list[dict[str, Any]]]:
    xls = pd.ExcelFile(path)
    students: dict[str, dict[str, Any]] = {}
    classes: dict[str, dict[str, Any]] = {}
    invoices: list[dict[str, Any]] = []
    payments: list[dict[str, Any]] = []
    followups: list[dict[str, Any]] = []

    ledger_sheets = [s for s in xls.sheet_names if s not in RHYTHMS_DEBT_SHEETS and "DEBTS" not in s.upper()]
    for sheet in ledger_sheets:
        df = read_sheet(path, sheet).iloc[:, :8]
        programme = sheet.strip()
        add_unique(classes, programme.upper(), {"name": programme, "level": "historical", "notes": source_note(path.name, sheet), "is_active": True})
        current_adm = ""
        current_name = ""
        first_date: str | None = None
        for index, row in df.iterrows():
            cols = list(row.values)
            dt, adm, details, receipt, dr_raw, cr_raw, bal_raw, notes_raw = (cols + [""] * 8)[:8]
            dt_iso = iso_date(dt)
            adm_text = clean(adm)
            details_text = clean(details)
            if not dt_iso and adm_text and details_text and not any(money(v) for v in (dr_raw, cr_raw)):
                current_adm = adm_text
                current_name = details_text
                first_date = None
                add_unique(
                    students,
                    dedupe_key(current_adm, current_name, programme),
                    {
                        "full_name": current_name,
                        "admission_number": current_adm,
                        "schoolpay_code": "",
                        "programme": programme,
                        "cohort": cohort_from_adm(current_adm),
                        "guardian_name": None,
                        "phone": None,
                        "email": None,
                        "enrollment_status": "historical",
                        "start_date": None,
                        "notes": source_note(path.name, sheet),
                    },
                )
                continue
            if not current_adm or not current_name:
                continue
            if not details_text or details_text.upper().startswith("TOTAL"):
                continue
            dr = money(dr_raw)
            cr = money(cr_raw)
            bal = money(bal_raw)
            if dr == 0 and cr == 0:
                continue
            if dt_iso and not first_date:
                first_date = dt_iso
                add_unique(
                    students,
                    dedupe_key(current_adm, current_name, programme),
                    {
                        "full_name": current_name,
                        "admission_number": current_adm,
                        "schoolpay_code": "",
                        "programme": programme,
                        "cohort": cohort_from_adm(current_adm),
                        "guardian_name": None,
                        "phone": None,
                        "email": None,
                        "enrollment_status": "historical",
                        "start_date": first_date,
                        "notes": source_note(path.name, sheet),
                    },
                )
            invoice_key = dedupe_key(current_adm, programme, index, dt_iso, details_text, receipt, dr, cr)
            invoices.append(
                {
                    "import_key": invoice_key,
                    "student_lookup": {"admission_number": current_adm, "full_name": current_name, "programme": programme},
                    "schoolpay_code": "",
                    "fee_item": details_text,
                    "term": term_from_date(dt_iso) or cohort_from_adm(current_adm),
                    "amount_expected_ksh": dr,
                    "amount_paid_ksh": cr,
                    "status": status_from_balance(dr, cr, bal),
                    "due_date": dt_iso,
                    "notes": source_note(path.name, sheet, f"receipt={clean(receipt)}; notes={clean(notes_raw)}"),
                }
            )
            if cr > 0:
                payments.append(
                    {
                        "invoice_import_key": invoice_key,
                        "student_lookup": {"admission_number": current_adm, "full_name": current_name, "programme": programme},
                        "amount_ksh": cr,
                        "method": "manual",
                        "reference": clean(receipt),
                        "paid_on": dt_iso or "2026-03-31",
                        "recorded_by": "historical-import",
                        "notes": source_note(path.name, sheet, f"details={details_text}; balance={bal:g}; notes={clean(notes_raw)}"),
                    }
                )

    for sheet in [s for s in xls.sheet_names if s in RHYTHMS_DEBT_SHEETS or "DEBTS" in s.upper()]:
        df = read_sheet(path, sheet)
        programme = sheet.upper().replace(" DEBTS", "").strip().title()
        for _, row in df.iterrows():
            adm = first_nonempty(row.get("ADM NO"), row.get("ADM"))
            name = clean(row.get("NAME"))
            if not adm or not name:
                continue
            balance_text = clean(row.get("BALANCE"))
            balance = money(row.get("BALANCE"))
            notes = "; ".join(
                [f"{k}={clean(v)}" for k, v in row.items() if k not in {"ADM NO", "ADM", "NAME", "BALANCE"} and clean(v)]
            )
            add_unique(
                students,
                dedupe_key(adm, name, programme),
                {
                    "full_name": name,
                    "admission_number": adm,
                    "schoolpay_code": "",
                    "programme": programme,
                    "cohort": cohort_from_adm(adm),
                    "guardian_name": None,
                    "phone": None,
                    "email": None,
                    "enrollment_status": "historical",
                    "start_date": None,
                    "notes": source_note(path.name, sheet, notes),
                },
            )
            if balance != 0 or ("NO RECORDS" in balance_text.upper()):
                followups.append(
                    {
                        "student_lookup": {"admission_number": adm, "full_name": name, "programme": programme},
                        "schoolpay_code": "",
                        "expected_fee_item": programme,
                        "follow_up_status": "review" if "NO RECORDS" in balance_text.upper() else "pending",
                        "last_known_fee_status": f"Balance {balance_text or f'{balance:g}'}",
                        "next_follow_up_date": None,
                        "notes": source_note(path.name, sheet, notes),
                    }
                )

    return {
        "classes": list(classes.values()),
        "students": list(students.values()),
        "invoices": invoices,
        "payments": payments,
        "followups": followups,
    }


def cohort_from_adm(adm: str) -> str:
    slash_year = re.search(r"/(\d{2})(?:\D|$)", adm)
    if slash_year:
        token = slash_year.group(1)
        return f"20{token}" if int(token) < 40 else f"19{token}"
    match = re.search(r"(\d{2,4})", adm)
    if not match:
        return ""
    token = match.group(1)
    if len(token) == 2:
        return f"20{token}" if int(token) < 40 else f"19{token}"
    return token


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


@dataclass
class SupabaseRest:
    url: str
    key: str

    def request(self, method: str, table: str, body: Any = None, query: dict[str, str] | None = None) -> Any:
        qs = urllib.parse.urlencode(query or {}, safe="(),.*")
        endpoint = f"{self.url.rstrip('/')}/rest/v1/{table}" + (f"?{qs}" if qs else "")
        data = None if body is None else json.dumps(body, default=str).encode("utf-8")
        for attempt in range(4):
            req = urllib.request.Request(endpoint, data=data, method=method)
            req.add_header("apikey", self.key)
            req.add_header("Authorization", f"Bearer {self.key}")
            req.add_header("Content-Type", "application/json")
            req.add_header("Prefer", "return=representation")
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    text = resp.read().decode("utf-8")
                    return json.loads(text) if text else []
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"Supabase {method} {table} failed ({exc.code}): {detail}") from exc
            except (urllib.error.URLError, ConnectionResetError) as exc:
                if attempt == 3:
                    raise
                time.sleep(1.5 * (attempt + 1))
        return []

    def select_all(self, table: str, columns: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            batch = self.request("GET", table, query={"select": columns, "limit": "1000", "offset": str(offset)})
            rows.extend(batch)
            if len(batch) < 1000:
                return rows
            offset += 1000

    def insert_many(self, table: str, rows: list[dict[str, Any]], batch_size: int = 250) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for start in range(0, len(rows), batch_size):
            chunk = rows[start : start + batch_size]
            if not chunk:
                continue
            keys = sorted({key for row in chunk for key in row.keys()})
            normalized = [{key: row.get(key) for key in keys} for row in chunk]
            out.extend(self.request("POST", table, normalized))
            time.sleep(0.05)
        return out


def env_is_placeholder(url: str, key: str) -> bool:
    joined = f"{url} {key}".lower()
    return not url or not key or "your_project" in joined or "paste_" in joined or "your_" in joined


def apply_payload(api: SupabaseRest, prefix: str, payload: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    student_table = f"{prefix}_students"
    invoice_table = f"{prefix}_fee_invoices"
    payment_table = f"{prefix}_fee_payments"
    followup_table = f"{prefix}_fee_followups"
    class_table = f"{prefix}_classes"

    counts: dict[str, int] = defaultdict(int)

    student_columns = "id,full_name,admission_number,programme" if prefix == "rhythms" else "id,full_name,admission_number"
    existing_students = api.select_all(student_table, student_columns)
    student_by_key = {
        dedupe_key(r.get("admission_number"), r.get("full_name"), r.get("programme", "")): r["id"] for r in existing_students
    }
    student_by_adm_name = {dedupe_key(r.get("admission_number"), r.get("full_name")): r["id"] for r in existing_students}

    class_ids: dict[str, str] = {}
    if payload.get("classes"):
        existing_classes = api.select_all(class_table, "id,name")
        class_ids = {dedupe_key(r.get("name")): r["id"] for r in existing_classes}
        new_classes = [c for c in payload["classes"] if dedupe_key(c["name"]) not in class_ids]
        inserted = api.insert_many(class_table, new_classes)
        counts[f"{class_table}_inserted"] = len(inserted)
        class_ids.update({dedupe_key(r.get("name")): r["id"] for r in inserted})

    new_students = []
    for row in payload["students"]:
        key3 = dedupe_key(row.get("admission_number"), row.get("full_name"), row.get("programme", ""))
        key2 = dedupe_key(row.get("admission_number"), row.get("full_name"))
        if key3 in student_by_key or key2 in student_by_adm_name:
            continue
        insert = {k: v for k, v in row.items() if v is not None and k != "student_lookup"}
        if prefix == "rhythms" and insert.get("programme"):
            insert["class_id"] = class_ids.get(dedupe_key(insert["programme"]))
        new_students.append(insert)
    inserted_students = api.insert_many(student_table, new_students)
    counts[f"{student_table}_inserted"] = len(inserted_students)
    for r in inserted_students:
        student_by_key[dedupe_key(r.get("admission_number"), r.get("full_name"), r.get("programme", ""))] = r["id"]
        student_by_adm_name[dedupe_key(r.get("admission_number"), r.get("full_name"))] = r["id"]

    try:
        existing_invoices = api.select_all(invoice_table, "id,student_id,fee_item,term,amount_expected_ksh,amount_paid_ksh,due_date,notes")
    except RuntimeError as exc:
        if "PGRST205" not in str(exc):
            raise
        counts.update(apply_snapshots_fallback(api, prefix, payload, student_by_key, student_by_adm_name))
        return dict(counts)
    existing_invoice_keys = {invoice_existing_key(r): r["id"] for r in existing_invoices}
    invoice_ids_by_import_key: dict[str, str] = {}
    invoices_to_insert = []
    for row in payload["invoices"]:
        lookup = row.pop("student_lookup")
        student_id = resolve_student_id(prefix, lookup, student_by_key, student_by_adm_name)
        insert = {k: v for k, v in row.items() if k != "import_key"}
        insert["student_id"] = student_id
        key = invoice_payload_key(insert)
        if key in existing_invoice_keys:
            invoice_ids_by_import_key[row["import_key"]] = existing_invoice_keys[key]
            continue
        invoices_to_insert.append((row["import_key"], insert))
    inserted_invoices = api.insert_many(invoice_table, [r for _, r in invoices_to_insert])
    counts[f"{invoice_table}_inserted"] = len(inserted_invoices)
    for (import_key, _), inserted in zip(invoices_to_insert, inserted_invoices):
        invoice_ids_by_import_key[import_key] = inserted["id"]

    existing_payments = api.select_all(payment_table, "id,invoice_id,student_id,amount_ksh,reference,paid_on,notes")
    existing_payment_keys = {payment_existing_key(r) for r in existing_payments}
    payments_to_insert = []
    for row in payload["payments"]:
        lookup = row.pop("student_lookup")
        import_key = row.pop("invoice_import_key")
        student_id = resolve_student_id(prefix, lookup, student_by_key, student_by_adm_name)
        insert = dict(row)
        insert["student_id"] = student_id
        insert["invoice_id"] = invoice_ids_by_import_key.get(import_key)
        key = payment_payload_key(insert)
        if key in existing_payment_keys:
            continue
        payments_to_insert.append(insert)
    counts[f"{payment_table}_inserted"] = len(api.insert_many(payment_table, payments_to_insert))

    existing_followups = api.select_all(followup_table, "id,student_id,expected_fee_item,last_known_fee_status,notes")
    existing_followup_keys = {followup_existing_key(r) for r in existing_followups}
    followups_to_insert = []
    for row in payload["followups"]:
        lookup = row.pop("student_lookup")
        insert = dict(row)
        insert["student_id"] = resolve_student_id(prefix, lookup, student_by_key, student_by_adm_name)
        key = followup_payload_key(insert)
        if key in existing_followup_keys:
            continue
        followups_to_insert.append(insert)
    counts[f"{followup_table}_inserted"] = len(api.insert_many(followup_table, followups_to_insert))
    return dict(counts)


def apply_snapshots_fallback(
    api: SupabaseRest,
    prefix: str,
    payload: dict[str, list[dict[str, Any]]],
    student_by_key: dict[str, str],
    student_by_adm_name: dict[str, str],
) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    batch_table = f"{prefix}_schoolpay_import_batches"
    snapshot_table = f"{prefix}_schoolpay_payment_snapshots"
    followup_table = f"{prefix}_fee_followups"

    existing_snapshots = api.select_all(
        snapshot_table,
        "id,student_id,admission_number,student_name,fee_item,amount_expected_ksh,amount_paid_ksh,balance_ksh,payment_status,captured_at,raw_payload",
    )
    existing_snapshot_keys = {snapshot_key(r) for r in existing_snapshots}

    batch = api.insert_many(
        batch_table,
        [
            {
                "source_label": "Historical school audit import",
                "imported_by": "historical-import",
                "row_count": len(payload["invoices"]),
                "notes": "Fallback import because manual fee invoice/payment tables are not deployed yet.",
                "metadata": {"source": "school_audit_import", "prefix": prefix},
            }
        ],
    )
    batch_id = batch[0]["id"] if batch else None
    counts[f"{batch_table}_inserted"] = len(batch)

    snapshots = []
    for row in payload["invoices"]:
        lookup = row["student_lookup"]
        student_id = resolve_student_id(prefix, lookup, student_by_key, student_by_adm_name)
        expected = float(row.get("amount_expected_ksh") or 0)
        paid = float(row.get("amount_paid_ksh") or 0)
        snapshot = {
            "batch_id": batch_id,
            "student_id": student_id,
            "schoolpay_code": row.get("schoolpay_code", ""),
            "admission_number": lookup.get("admission_number", ""),
            "student_name": lookup.get("full_name", ""),
            "fee_item": row.get("fee_item", ""),
            "amount_expected_ksh": expected,
            "amount_paid_ksh": paid,
            "balance_ksh": expected - paid,
            "payment_status": row.get("status", ""),
            "raw_payload": {
                "import_key": row.get("import_key"),
                "term": row.get("term"),
                "due_date": row.get("due_date"),
                "notes": row.get("notes"),
                "source": "historical_school_audit",
            },
            "captured_at": f"{row.get('due_date')}T00:00:00+03:00" if row.get("due_date") else datetime.now().astimezone().isoformat(),
        }
        if snapshot_key(snapshot) not in existing_snapshot_keys:
            snapshots.append(snapshot)
    counts[f"{snapshot_table}_inserted"] = len(api.insert_many(snapshot_table, snapshots))

    existing_followups = api.select_all(followup_table, "id,student_id,expected_fee_item,last_known_fee_status,notes")
    existing_followup_keys = {followup_existing_key(r) for r in existing_followups}
    followups_to_insert = []
    for row in payload["followups"]:
        lookup = row.pop("student_lookup")
        insert = dict(row)
        insert["student_id"] = resolve_student_id(prefix, lookup, student_by_key, student_by_adm_name)
        key = followup_payload_key(insert)
        if key in existing_followup_keys:
            continue
        followups_to_insert.append(insert)
    counts[f"{followup_table}_inserted"] = len(api.insert_many(followup_table, followups_to_insert))
    return dict(counts)


def snapshot_key(row: dict[str, Any]) -> str:
    return dedupe_key(
        row.get("student_id"),
        row.get("admission_number"),
        row.get("student_name"),
        row.get("fee_item"),
        row.get("amount_expected_ksh"),
        row.get("amount_paid_ksh"),
        row.get("balance_ksh"),
        row.get("payment_status"),
        (row.get("raw_payload") or {}).get("import_key") if isinstance(row.get("raw_payload"), dict) else "",
    )


def resolve_student_id(prefix: str, lookup: dict[str, Any], by_key: dict[str, str], by_adm_name: dict[str, str]) -> str | None:
    if prefix == "rhythms":
        return by_key.get(dedupe_key(lookup.get("admission_number"), lookup.get("full_name"), lookup.get("programme"))) or by_adm_name.get(
            dedupe_key(lookup.get("admission_number"), lookup.get("full_name"))
        )
    return by_adm_name.get(dedupe_key(lookup.get("admission_number"), lookup.get("full_name")))


def invoice_payload_key(row: dict[str, Any]) -> str:
    return dedupe_key(row.get("student_id"), row.get("fee_item"), row.get("term"), row.get("amount_expected_ksh"), row.get("amount_paid_ksh"), row.get("due_date"), row.get("notes"))


def invoice_existing_key(row: dict[str, Any]) -> str:
    return invoice_payload_key(row)


def payment_payload_key(row: dict[str, Any]) -> str:
    return dedupe_key(row.get("invoice_id"), row.get("student_id"), row.get("amount_ksh"), row.get("reference"), row.get("paid_on"), row.get("notes"))


def payment_existing_key(row: dict[str, Any]) -> str:
    return payment_payload_key(row)


def followup_payload_key(row: dict[str, Any]) -> str:
    return dedupe_key(row.get("student_id"), row.get("expected_fee_item"), row.get("last_known_fee_status"), row.get("notes"))


def followup_existing_key(row: dict[str, Any]) -> str:
    return followup_payload_key(row)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rayyan", type=Path, default=DEFAULT_RAYYAN)
    parser.add_argument("--rhythms", type=Path, default=DEFAULT_RHYTHMS)
    parser.add_argument("--env", type=Path, default=ROOT / "apps" / "ops-hub" / ".env.local")
    parser.add_argument("--apply", action="store_true", help="Write to Supabase. Default is dry-run only.")
    args = parser.parse_args()

    rayyan = parse_rayyan(args.rayyan)
    rhythms = parse_rhythms(args.rhythms)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "rayyan_payload.json").write_text(json.dumps(rayyan, indent=2, default=str), encoding="utf-8")
    (OUTPUT_DIR / "rhythms_payload.json").write_text(json.dumps(rhythms, indent=2, default=str), encoding="utf-8")

    summary: dict[str, Any] = {
        "rayyan": {k: len(v) for k, v in rayyan.items()},
        "rhythms": {k: len(v) for k, v in rhythms.items()},
        "applied": False,
        "outputs": {
            "rayyan_payload": str(OUTPUT_DIR / "rayyan_payload.json"),
            "rhythms_payload": str(OUTPUT_DIR / "rhythms_payload.json"),
        },
    }

    env = {**load_env(args.env), **os.environ}
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if args.apply:
        if env_is_placeholder(url, key):
            print("Cannot apply: Supabase URL/key are missing or placeholders.", file=sys.stderr)
            print(json.dumps(summary, indent=2))
            return 2
        api = SupabaseRest(url, key)
        summary["applied"] = True
        summary["rayyan_apply"] = apply_payload(api, "rayyan", rayyan)
        summary["rhythms_apply"] = apply_payload(api, "rhythms", rhythms)

    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
