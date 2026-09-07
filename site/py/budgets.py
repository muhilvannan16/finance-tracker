import json
from calendar import monthrange
from datetime import date

def has_overlap(category, start_date, end_date, existing_budgets):
    """
    Check whether a proposed budget conflicts with any existing budget.

    Two budgets conflict if they share the same category (including
    two "Overall" budgets, where category is None) AND their date
    ranges overlap.

    Args:
        category (str | None): The category of the new budget, or
            None if it's an "Overall" budget.
        start_date (str): ISO date string, e.g. "2026-09-01".
        end_date (str): ISO date string, e.g. "2026-09-30".
        existing_budgets (list[dict]): Each dict has keys "category",
            "startDate", "endDate" (matching the JS budget object shape).

    Returns:
        bool: True if a conflicting budget exists, False otherwise.
    """
    for budget in existing_budgets:
        
        if category == budget['category']:
            existing_start = budget['startDate']
            existing_end = budget['endDate']

            if not (end_date < existing_start or start_date > existing_end):
                return True
        

    # No conflicts found after checking every existing budget
    return False

def has_overlap_json(category, start_date, end_date, existing_budgets_json):
    """
    JSON-string wrapper around has_overlap, for calling from JS via Pyodide.

    Pyodide can only pass primitives (strings, numbers, booleans) cleanly
    across the JS<->Python boundary — a list of budget dicts has to cross
    as a JSON string and get decoded back into real Python objects on this
    side before the actual logic can use it.

    Args:
        category (str | None): The category of the new budget, or
            None if it's an "Overall" budget.
        start_date (str): ISO date string, e.g. "2026-09-01".
        end_date (str): ISO date string, e.g. "2026-09-30".
        existing_budgets_json (str): JSON-stringified array of existing
            budget objects (same shape saveBudgets() persists).

    Returns:
        bool: True if a conflicting budget exists, False otherwise.
    """

    existing_budgets = json.loads(existing_budgets_json)

    return has_overlap(category, start_date, end_date, existing_budgets)

def amount_spent(category, start_date, end_date, transactions):
    """
    Sum the total amount spent in a given category and date range.

    Only counts transactions with direction == "expense". Monthly-
    recurring transactions are expanded — each occurrence that falls
    inside the window counts separately, not just the template once.
    Spending is also capped at today's date, so future-dated
    transactions inside the window don't count as already spent.

    Args:
        category (str | None): The category to filter by, or None to
            include all categories (an "Overall" budget).
        start_date (str): ISO date string, e.g. "2026-09-01".
        end_date (str): ISO date string, e.g. "2026-09-30".
        transactions (list[dict]): Each dict has keys "category",
            "date", "amount", "direction", "frequency" (matching
            storage.js's shape).

    Returns:
        float: The total amount spent matching the filters.
    """
    start_date_obj = date.fromisoformat(start_date)
    end_date_obj = date.fromisoformat(end_date)

    effective_end = min(end_date_obj, date.today())
    total = 0

    for tx in transactions:
        if tx['direction'] != "expense":
            continue

        if category is not None and tx['category'] != category:
            continue

        tx_date_obj = date.fromisoformat(tx['date'])

        occurences = count_occurrences_in_range(tx_date_obj, tx['frequency'], start_date_obj, effective_end)
        total += tx['amount'] * occurences

    return total

def amount_spent_json(category, start_date, end_date, transactions_json):
    """
    JSON-string wrapper around amount_spent, for calling from JS via Pyodide.

    Args:
        category (str | None): The category to filter by, or None to
            include all categories (an "Overall" budget).
        start_date (str): ISO date string, e.g. "2026-09-01".
        end_date (str): ISO date string, e.g. "2026-09-30".
        transactions_json (str): JSON-stringified array of transaction
            objects (same shape saveTransactions() persists).

    Returns:
        float: The total amount spent matching the filters.
    """
    transactions = json.loads(transactions_json)
    return amount_spent(category, start_date, end_date, transactions)

def add_one_month(d):
    """
    Returns the date exactly one calendar month after d, anchored to d's
    own day-of-month. If that day doesn't exist in the target month
    (e.g. Jan 31 -> Feb), clamps to that month's last valid day.

    Duplicated from projection.py rather than imported, since each
    Pyodide-loaded engine file is self-contained (budgets.py is loaded
    independently on the Planner page, without projection.py).
    """
    year = d.year
    month = d.month + 1
    if month > 12:
        month = 1
        year += 1
    day = d.day
    last_day_of_target_month = monthrange(year, month)[1]
    if day > last_day_of_target_month:
        day = last_day_of_target_month
    return date(year, month, day)


def count_occurrences_in_range(tx_date, frequency, range_start, range_end):
    """
    Counts how many times a transaction actually lands inside
    [range_start, range_end] (inclusive), given its frequency.

    A "none" transaction occurs at most once — either its date falls
    in the window or it doesn't. A "monthly" transaction is a
    template: it recurs every month from tx_date onward, and each
    individual occurrence that lands in the window counts separately.

    Args:
        tx_date (date): The transaction's anchor date.
        frequency (str): "none" or "monthly".
        range_start (date): Start of the window (inclusive).
        range_end (date): End of the window (inclusive).

    Returns:
        int: The number of occurrences falling inside the window.
    """
    if frequency == "none":
        if range_start <= tx_date <= range_end:
            return 1
        else:
            return 0
        
    elif frequency == "monthly":
        count = 0
        current = tx_date
        while current <= range_end:
            if current >= range_start:
                count += 1
            current = add_one_month(current)
            
        return count

    return 0