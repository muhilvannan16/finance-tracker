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
            beyond every debt's own minimum, directed at the current
            target debt.

    Returns:
        dict: {
            "strategy": str,
            "success": bool — whether every debt reached $0 within
                MAX_MONTHS,
            "months": int or None — months taken if successful, else
                None,
            "totalInterestPaid": float,
        }
    """
    working = [dict(d) for d in order_debts(debts, strategy)]
    total_interest_paid = 0
    months = 0

    while months < MAX_MONTHS:
        if all(d["balance"] <= 0 for d in working):
            break
        months += 1

        for d in working:
            if d["balance"] > 0:
                interest = d["balance"] * (d["interestRate"] / 100 / 12)
                d["balance"] += interest
                total_interest_paid += interest

        target = next((d for d in working if d["balance"] > 0), None)

        for d in working:
            if d["balance"] > 0:
                payment = d["balance"] * (d["minimumPaymentPercent"] / 100)
                if d is target:
                    payment += extra_payment
                payment = min(payment, d["balance"])
                d["balance"] -= payment


    success = all(d["balance"] <= 0 for d in working)
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