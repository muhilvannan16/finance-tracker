import json

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

    Only counts transactions with direction == "expense" — income
    transactions don't count against a spending budget, even if they
    happen to share the same category.

    Args:
        category (str | None): The category to filter by, or None to
            include all categories (an "Overall" budget).
        start_date (str): ISO date string, e.g. "2026-09-01".
        end_date (str): ISO date string, e.g. "2026-09-30".
        transactions (list[dict]): Each dict has keys "category",
            "date", "amount", "direction" (matching storage.js's shape).

    Returns:
        float: The total amount spent matching the filters.
    """
    total = 0

    for tx in transactions:
        # Step 1: skip anything that isn't an expense
        if tx['direction'] != "expense":
            continue

        # Step 2: skip anything outside the date range
        if tx['date'] < start_date or tx['date'] > end_date:
            continue

        # Step 3: skip anything that doesn't match the category
        #         (remember: category=None means "match everything")
        if category is not None and tx['category'] != category:
            continue

        # Step 4: add this transaction's amount to the running total
        total += tx['amount']

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