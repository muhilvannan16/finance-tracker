import json

def order_debts(debts, strategy):
    """
    Returns a NEW list of debts sorted according to the payoff
    strategy — does not mutate the input list, since the simulation
    needs to track balances independently of whatever order the
    caller originally supplied them in.

    Avalanche: highest interest rate first (attack the most
    expensive debt).
    Snowball: smallest balance first (quick wins, psychological
    momentum).

    Args:
        debts (list[dict]): Each dict has keys "id", "balance",
            "interestRate", "minimumPaymentPercent".
        strategy (str): "avalanche" or "snowball".

    Returns:
        list[dict]: A new, sorted list (same dicts, new order).
    """
    
    if strategy == "avalanche":
        return sorted(debts, key=lambda d: d["interestRate"], reverse=True)
    elif strategy == "snowball":
        return sorted(debts, key=lambda d: d["balance"])
    else:
        raise ValueError(f"Unknown strategy: {strategy}")



MAX_MONTHS = 600


CENT = 0.01

def simulate_payoff(debts, strategy, extra_payment):
    """
    Simulates a month-by-month payoff plan, applying minimum payments
    to every debt and cascading the extra payment onto whichever debt
    is next in the strategy's fixed order. Capped at MAX_MONTHS to
    guard against a debt whose minimum payment (percentage-based, no
    floor) never exceeds its own monthly interest — which would
    otherwise mean it can never reach zero.

    Args:
        debts (list[dict]): Each dict has keys "id", "balance"
            (current balance, not startingBalance), "interestRate"
            (APR as a percentage), "minimumPaymentPercent".
        strategy (str): "avalanche" or "snowball".
        extra_payment (float): Additional amount paid each month,
            beyond every debt's own minimum, distributed across debts
            in strategy order — cascading to the next debt in the
            same month if the current one is paid off with money
            left over.

    Returns:
        dict: {
            "strategy": str,
            "success": bool — whether every debt reached $0 (or a
                sub-cent residue) within MAX_MONTHS,
            "months": int or None — months taken if successful, else
                None,
            "totalInterestPaid": float,
        }
    """
    working = [dict(d) for d in order_debts(debts, strategy)]
    total_interest_paid = 0
    months = 0

    while months < MAX_MONTHS:
        if all(d["balance"] <= CENT for d in working):
            break
        months += 1

        for d in working:
            if d["balance"] > CENT:
                interest = d["balance"] * (d["interestRate"] / 100 / 12)
                d["balance"] += interest
                total_interest_paid += interest

        for d in working:
            if d["balance"] > CENT:
                minimum = d["balance"] * (d["minimumPaymentPercent"] / 100)
                minimum = min(minimum, d["balance"])
                d["balance"] -= minimum

        remaining_extra = extra_payment
        for d in working:
            if remaining_extra <= 0:
                break
            if d["balance"] > CENT:
                applied = min(remaining_extra, d["balance"])
                d["balance"] -= applied
                remaining_extra -= applied

        for d in working:
            if d["balance"] <= CENT:
                d["balance"] = 0

    success = all(d["balance"] <= CENT for d in working)
    return {
        "strategy": strategy,
        "success": success,
        "months": months if success else None,
        "totalInterestPaid": total_interest_paid,
    }

def simulate_payoff_json(debts_json, strategy, extra_payment):
    """
    JSON-string wrapper around simulate_payoff, for calling from JS
    via Pyodide.

    Args:
        debts_json (str): JSON-stringified array of debt objects, each
            with "id", "balance", "interestRate",
            "minimumPaymentPercent" (already-computed current
            balances, not startingBalance — the caller is responsible
            for that, same as net worth's approach).
        strategy (str): "avalanche" or "snowball".
        extra_payment (float): Additional monthly payment beyond
            minimums, directed at the current target debt.

    Returns:
        str: JSON-stringified result dict — see simulate_payoff's
            docstring for its shape.
    """
    debts = json.loads(debts_json)

    result = simulate_payoff(debts, strategy, extra_payment)
    return json.dumps(result)