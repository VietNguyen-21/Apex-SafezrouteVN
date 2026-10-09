"""Select genuinely different, quality-bounded initial-world fleet forecasts.

This is a versioned offline comparison policy, not a replacement for a pinned
SDK or its certificates. It never changes an edge, action, metric or custody.
"""
from itertools import product

VERSION = 'saferoute-diverse-offline-profiles/1'
METRICS = ('total_distance_m', 'total_travel_time_s', 'total_exposure',
           'total_cost_vnd', 'total_soft_lateness_s')


def route_key(routes):
    # Ignore profile IDs and equivalent vehicle swaps; actual work/roads matter.
    return tuple(sorted((tuple(r['order_sequence']), tuple(
        a['edge_id'] for a in r['actions'] if a['kind'] == 'EDGE')) for r in routes))


def roads(routes):
    return {a['edge_id'] for r in routes for a in r['actions'] if a['kind'] == 'EDGE'}


def difference(left, right):
    a, b = roads(left), roads(right)
    return len(a ^ b) / max(1, len(a | b))


def select_diverse(columns, vehicle_ids, order_ids, config, *, min_difference=.01,
                   max_degradation=.25, combination_limit=300000):
    if not 0 < min_difference <= 1 or not 0 <= max_degradation <= 1:
        raise ValueError('Invalid diversity/quality bounds')
    by_key = {}
    choices = [[r for r in columns if r['vehicle_id'] == vid] + [None] for vid in sorted(vehicle_ids)]
    count = 0
    for selection in product(*choices):
        count += 1
        if count > combination_limit:
            break
        routes = [r for r in selection if r is not None]
        served = [o for r in routes for o in r['order_sequence']]
        if len(served) != len(set(served)) or set(served) != set(order_ids):
            continue
        key = route_key(routes)
        metrics = {k: sum(r[k] for r in routes) for k in METRICS}
        fleet = {'routes': routes, 'metrics': metrics, 'key': key}
        # Equivalent vehicle swaps are one road solution. Retain the cheaper
        # assignment (then lowest vehicle IDs), rather than whichever was first.
        preference = lambda f: (f['metrics']['total_soft_lateness_s'], f['metrics']['total_cost_vnd'],
                                tuple(r['vehicle_id'] for r in f['routes']))
        if key not in by_key or preference(fleet) < preference(by_key[key]):
            by_key[key] = fleet
    fleets = list(by_key.values())
    if not fleets:
        raise ValueError('INSUFFICIENT_DISTINCT_PLANS: no complete feasible fleet in bounded domain')
    # Keep coverage and lateness comparable across the three choices.
    best_late = min(f['metrics']['total_soft_lateness_s'] for f in fleets)
    fleets = [f for f in fleets if abs(f['metrics']['total_soft_lateness_s'] - best_late) < 1e-6]
    def score(f, profile):
        m, w, ref = f['metrics'], config['profiles'][profile], config['references']
        return (w['time'] * m['total_travel_time_s'] / ref['travel_time_s']
                + w['risk'] * m['total_exposure'] / ref['relative_exposure_proxy']
                + w['distance'] * m['total_distance_m'] / ref['distance_m'])
    # Never manufacture distinction by selecting a strictly dominated detour.
    dimensions = ('total_travel_time_s', 'total_exposure', 'total_cost_vnd')
    frontier = [f for f in fleets if not any(
        all(g['metrics'][k] <= f['metrics'][k] for k in dimensions)
        and any(g['metrics'][k] < f['metrics'][k] for k in dimensions) for g in fleets)]
    ranked = {p: sorted(frontier, key=lambda f: (score(f, p), f['key']))
              for p in ('FASTEST', 'BALANCED', 'SAFER')}
    fastest = ranked['FASTEST'][0]
    selected = {'FASTEST': fastest}
    # Try safer extremes before the compromise, with bounded profile regret.
    for safer in ranked['SAFER']:
        if safer['metrics']['total_exposure'] >= fastest['metrics']['total_exposure']:
            continue
        if difference(fastest['routes'], safer['routes']) < min_difference:
            continue
        if score(safer, 'SAFER') > score(ranked['SAFER'][0], 'SAFER') * (1 + max_degradation) + 1e-9:
            continue
        if safer['metrics']['total_travel_time_s'] > fastest['metrics']['total_travel_time_s'] * (1 + max_degradation):
            continue
        for balanced in ranked['BALANCED']:
            if not (fastest['metrics']['total_travel_time_s'] <= balanced['metrics']['total_travel_time_s'] <= safer['metrics']['total_travel_time_s']
                    and safer['metrics']['total_exposure'] <= balanced['metrics']['total_exposure'] <= fastest['metrics']['total_exposure']):
                continue
            if min(difference(balanced['routes'], fastest['routes']), difference(balanced['routes'], safer['routes'])) < min_difference:
                continue
            if score(balanced, 'BALANCED') > score(ranked['BALANCED'][0], 'BALANCED') * (1 + max_degradation) + 1e-9:
                continue
            selected.update(BALANCED=balanced, SAFER=safer)
            return selected, {'policy': VERSION, 'combination_count': min(count, combination_limit),
                              'enumeration_truncated': count > combination_limit,
                              'feasible_unique_fleets': len(fleets), 'pareto_fleets': len(frontier),
                              'min_edge_difference': min_difference, 'max_profile_degradation': max_degradation,
                              'global_optimality_proven': False}
    raise ValueError('INSUFFICIENT_DISTINCT_PLANS: fewer than three distinct quality-bounded nondominated results')
