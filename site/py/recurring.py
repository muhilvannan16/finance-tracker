def find_valid_runs(sorted_group):
    """
    Given a list of transactions (already sorted by date, already
    confirmed to share label/category/amount-tolerance), splits them
    into maximal runs where every consecutive pair is 27-33 days apart.
    Returns a list of runs (each run is a list of transactions),
    keeping only runs with 3 or more transactions.
    """
    if not sorted_group:
        return []

    valid_runs = []
    current_run = [sorted_group[0]]

    for i in range(1, len(sorted_group)):
        gap_days = (sorted_group[i]['date'] - sorted_group[i - 1]['date']).days

        if 27 <= gap_days <= 33:
            current_run.append(sorted_group[i])
        else:
            if len(current_run) >= 3:
                valid_runs.append(current_run)
            current_run = [sorted_group[i]]

    if len(current_run) >= 3:
        valid_runs.append(current_run)
    return valid_runs

def group_by_amount_tolerance(same_label_category_group, tolerance_pct=0.063):
    """
    Given a list of transactions that already share the same normalized
    label and category, sorts them by amount and splits them into
    maximal runs where every amount stays within tolerance_pct of that
    run's minimum amount. Returns a list of runs (each a list of
    transactions), including runs shorter than 3 — length filtering
    happens elsewhere.
    """
    if not same_label_category_group:
        return []

    sorted_group = sorted(same_label_category_group, key=lambda t: t['amount'])

    valid_runs = []
    current_run = [sorted_group[0]]
    run_min = sorted_group[0]['amount']

    for i in range(1, len(sorted_group)):
        amount = sorted_group[i]['amount']

        if run_min * (1 - tolerance_pct) <= amount <= run_min * (1 + tolerance_pct):
            current_run.append(sorted_group[i])
        else:
            valid_runs.append(current_run)
            current_run = [sorted_group[i]]
            run_min = amount

    valid_runs.append(current_run)

    return valid_runs

def find_recurring_groups(transactions, tolerance_pct=0.063):
    """
    Given a full list of transactions, finds groups that appear to be
    the same recurring monthly charge: same label and category
    (case-insensitive), amounts within tolerance_pct of each other,
    and dates forming a chain of 27-33 day gaps. Returns a list of
    groups (each a list of transactions), keeping only groups with
    3 or more transactions.
    """
    # Step 1: bucket transactions by (label.lower(), category.lower())
    buckets = {}
    for t in transactions:
        key = (t['label'].lower(), t['category'].lower())
        # TODO: add t to buckets[key], creating the list if needed
        if key not in buckets:
            buckets[key] = []
        buckets[key].append(t)

    recurring_groups = []

    # Step 2 & 3: for each bucket, split by amount, then by date
    for key, group in buckets.items():
        amount_runs = group_by_amount_tolerance(group, tolerance_pct)
        for amount_run in amount_runs:
            # TODO: sort amount_run by date before passing to find_valid_runs
            sorted_run = sorted(amount_run, key=lambda t: t['date'])
            date_chains = find_valid_runs(sorted_run)
            # TODO: date_chains is a list of runs — add each one that's
            # 3+ transactions long to recurring_groups
            for chain in date_chains:
                if len(chain) >= 3:
                    recurring_groups.append(chain)

    return recurring_groups