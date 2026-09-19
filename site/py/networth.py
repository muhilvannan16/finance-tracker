"""
Net worth engine for finance-tracker.

Reuses projection.py's per-account balance logic (projected_balance,
balance_series, parse_dated_records) — loaded separately on the
Planner page — combining every account's balance into a single net
worth figure, with liability accounts subtracted rather than added.
"""

import json
from datetime import date


# balance_series and parse_dated_records come from projection.py,
# loaded separately into the same Pyodide namespace at runtime —
# Pylance can't see that connection, hence the "undefined" warning below.

def net_worth_series(accounts, transactions, transfers, start_date, end_date):
    """
    Computes net worth at monthly checkpoints between start_date and
    end_date (inclusive), by combining every account's own balance
    series — via balance_series from projection.py — with a sign
    based on its type: asset accounts add, liability accounts subtract.

    Args:
        accounts (list[dict]): Each dict has keys "id", "startingBalance",
            "type" ("asset" or "liability").
        transactions (list[dict]): Parsed transaction records (date
            already converted to a real date object).
        transfers (list[dict]): Parsed transfer records (date already
            converted to a real date object).
        start_date (date): Start of the range.
        end_date (date): End of the range.

    Returns:
        list[dict]: Each dict has "date" (a date object) and "netWorth"
            (a number), one per checkpoint, in chronological order.
    """
    combined = {}

    for account in accounts:
        account_id = account['id']
        starting_balance = account['startingBalance']
        account_type = account['type']
        balance_series_points = balance_series(transactions, transfers, starting_balance, start_date, end_date, account_id, account_type)
        sign = -1 if account_type == 'liability' else 1
        for point_date, balance in balance_series_points:
            combined[point_date] = combined.get(point_date, 0) + sign * balance


    result = [{"date": d, "netWorth": combined[d]} for d in sorted(combined.keys())]
    return result

def net_worth_series_json(accounts_json, transactions_json, transfers_json, start_date_str, end_date_str):
    """
    JSON-friendly entry point for net_worth_series, callable from
    JavaScript.

    Args:
        accounts_json (str): JSON-stringified array of account objects
            (same shape saveAccounts() persists).
        transactions_json (str): JSON-stringified array of transaction
            objects (same shape saveTransactions() persists).
        transfers_json (str): JSON-stringified array of transfer
            objects (same shape saveTransfers() persists).
        start_date_str (str): ISO date string, e.g. "2026-01-01".
        end_date_str (str): ISO date string, e.g. "2026-12-31".

    Returns:
        str: JSON-stringified array of {"date": ..., "netWorth": ...}
            checkpoints.
    """
    accounts = json.loads(accounts_json)


    transactions = parse_dated_records(transactions_json)
    transfers = parse_dated_records(transfers_json)

    start_date = date.fromisoformat(start_date_str)
    end_date = date.fromisoformat(end_date_str)

    result = net_worth_series(accounts, transactions, transfers, start_date, end_date)
    for item in result:
        item["date"] = item["date"].isoformat()
    return json.dumps(result)
