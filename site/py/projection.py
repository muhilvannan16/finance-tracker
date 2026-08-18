"""
Projection engine for finance-tracker.

Given a list of transactions and a starting balance, calculates the
projected account balance as of any given date — past, present, or future.
"""
import json
from datetime import date
from calendar import monthrange


def transaction_occurred_by(transaction_date, as_of_date):
    """
    Returns True if a one-time transaction (frequency == "none") counts
    as having happened by as_of_date.
    """
    return transaction_date <= as_of_date


def count_monthly_occurrences(start_date, as_of_date):
    """
    Returns how many times a monthly-recurring transaction, anchored to
    start_date's day-of-month, has occurred on or before as_of_date.
    start_date itself counts as the first occurrence if it qualifies.
    Months that don't have the anchor day (e.g. day 31 in February) land
    on that month's last valid day instead.
    """
    if start_date > as_of_date:
        return 0

    # Count the number of months between the two dates
    month_count = (as_of_date.year - start_date.year) * 12 + (as_of_date.month - start_date.month)

    # Check if the anchor day has occurred in the as_of_date's month
    anchor_day = start_date.day
    last_day_of_as_of_month = monthrange(as_of_date.year, as_of_date.month)[1]
    if anchor_day > last_day_of_as_of_month:
        anchor_day = last_day_of_as_of_month

    if as_of_date.day >= anchor_day:
        month_count += 1

    return month_count


def projected_balance(transactions, starting_balance, as_of_date):
    """
    Calculates the projected balance as of as_of_date, given a starting
    balance and a list of transaction dicts (keys: amount, direction,
    date, frequency).
    """
    balance = starting_balance

    for transaction in transactions:
        amount = transaction['amount']
        direction = transaction['direction']
        transaction_date = transaction['date']
        frequency = transaction['frequency']

        if frequency == "none":
            if transaction_occurred_by(transaction_date, as_of_date):
                balance += amount if direction == "income" else -amount
        elif frequency == "monthly":
            occurrences = count_monthly_occurrences(transaction_date, as_of_date)
            balance += occurrences * (amount if direction == "income" else -amount)

    return balance

def project_from_json(transactions_json, starting_balance, as_of_date_str):
    """
    JSON-friendly entry point, callable from JavaScript.

    transactions_json: a JSON string of transaction objects, exactly as
        stored by storage.js (dates as "YYYY-MM-DD" strings).
    starting_balance: a plain number.
    as_of_date_str: the target date as an ISO string, e.g. "2026-06-01".

    Returns the projected balance as a plain number.
    """

    transactions = json.loads(transactions_json)

    converted_transactions = []
    for transaction in transactions:
        converted_transactions.append({
            **transaction,
            "date": date.fromisoformat(transaction["date"]),
        })

    as_of_date = date.fromisoformat(as_of_date_str)

    return projected_balance(converted_transactions, starting_balance, as_of_date)