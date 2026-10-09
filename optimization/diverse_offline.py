"""Recompute initial S0-S4 offline comparisons from verified, read-only M1 data.

Usage: python -B -m optimization.diverse_offline --scenario S0 --seconds 240
Failure writes diagnostics only; never replaces a frontend asset with bad plans.
"""
import argparse
from copy import deepcopy
from dataclasses import replace
from itertools import combinations, permutations
import json
from pathlib import Path
from time import monotonic

from optimization.integration.member1_decision_state_adapter import load_pinned_initial_states
from optimization.integration.member1_static_runner import _verified_source
from optimization.integration.member1_s0_graph import Member1RoadGraph
from optimization.integration.member1_profiles import load_profile_config
from optimization.models.decision_state import DecisionState
from optimization.models.member1_dynamic_state import sha
from optimization.rolling_horizon.member1_dynamic_planner import DynamicLimits
from optimization.rolling_horizon.member1_dynamic_validation import route_check
from optimization.solver.diverse_profiles import VERSION, select_diverse, difference
from optimization.solver.profile_paths import ProfileColumns


def build_domain(state, graph, limits, config, seeds=()):
    builder = ProfileColumns(state, graph, limits, config)
    builder.columns = deepcopy(list(seeds))
    builder.keys = {sha(r) for r in builder.columns}
    orders = sorted(state.orders, key=lambda o: o.order_id)
    proposals = []
    for size in range(1, len(orders) + 1):
        for subset in combinations(orders, size):
            for vehicle in state.vehicles:
                ids = {o.order_id for o in subset}
                if vehicle.availability != 'AVAILABLE' or sum(o.demand_kg for o in subset) > vehicle.capacity_kg:
                    continue
                if not set(vehicle.onboard_order_ids).issubset(ids) or any(o.status == 'ONBOARD' and o.assigned_vehicle_id != vehicle.vehicle_id for o in subset):
                    continue
                sequences = list(permutations(sorted(ids))) if len(ids) <= 3 else [tuple(sorted(ids)), tuple(reversed(sorted(ids)))]
                for sequence in sequences:
                    proposals.append((vehicle, sequence))
    # Fairly allocate a slice to every objective; no full-coverage early exit.
    start = monotonic()
    for ordinal, objective in enumerate(('time', 'balanced', 'exposure')):
        builder.deadline = start + limits.domain_seconds * (ordinal + 1) / 3
        for vehicle, sequence in proposals:
            if monotonic() >= builder.deadline or builder.proposals >= limits.max_proposals or len(builder.columns) >= limits.max_columns:
                break
            builder.realize(vehicle, sequence, pickup_ids=[o for o in sequence if builder.orders[o].status == 'WAITING'], objective=objective)
    domain = builder.domain()
    domain.update(schema_version='saferoute-diverse-offline-domain/1', planner_version=VERSION)
    domain.pop('content_sha256')
    domain['content_sha256'] = sha(domain)
    return domain


def browser_route(route):
    """Keep audit metadata in domain.json, not in browser/localStorage copies."""
    action_fields = {'kind','order_id','node_id','edge_id','geometry','distance_m',
                     'exposure','load_after_kg','start_us','end_us'}
    return {'vehicle_id': route['vehicle_id'], 'order_sequence': route['order_sequence'],
            'actions': [{k: v for k, v in a.items() if k in action_fields} for a in route['actions']]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario', choices=['S0','S1','S2','S3','S4'], default='S0')
    parser.add_argument('--seconds', type=float, default=240.)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    output = root / 'outputs' / 'diverse_profiles' / args.scenario
    output.mkdir(parents=True, exist_ok=True)
    batch = load_pinned_initial_states(root)
    if batch.get('status') != 'INITIAL_STATE_READY':
        raise ValueError('Pinned source contract gate failed')
    state = DecisionState.from_dict(next(s for s in batch['states'] if s['scenario_id'] == args.scenario))
    paths, hashes = _verified_source(root, state)
    original = json.loads((root / 'frontend/src/mocks/data/member2-road-packs.json').read_text())
    pack = next(p for p in original['packs'] if p['scenarioId'] == args.scenario and p['phase'] == 'INITIAL')
    seeds = list({sha(r): r for a in pack['alternatives'] for r in a['vehicle_routes']}.values())
    config = load_profile_config(root / 'configs/member1_profiles_step3.json')
    with Member1RoadGraph(paths['network_sqlite_sha256'], paths['features_sqlite_sha256'], routing_version=state.routing_version,
                         features_version=state.features_version, context_version=state.context_version, source_hashes=hashes) as graph:
        orders = {o.order_id: o for o in state.orders}
        for seed in seeds:
            # Browser exports omit raw metadata; recover only from authenticated
            # SQLite/action facts, then independently verify every value.
            seed.update(start_node=state.depot.graph_node_id, end_node=state.depot.graph_node_id,
                        start_us=seed['actions'][0]['start_us'])
            previous = None
            load = next(v.current_load_kg for v in state.vehicles if v.vehicle_id == seed['vehicle_id'])
            for action in seed['actions']:
                if action['kind'] == 'EDGE':
                    edge = graph._checked_edge(graph.edge(action['edge_id']))
                    action.update(from_node=edge['fromNodeId'], to_node=edge['toNodeId'], incoming_edge=previous,
                                  fraction_start=0., fraction_end=1., feature_payload=edge['payload'])
                    previous = action['edge_id']
                elif action['kind'] == 'SERVICE':
                    action['continuation'] = False
                    load = action['load_after_kg']
                elif action['kind'] == 'PICKUP':
                    load = action['load_after_kg']
            seed['return_load_kg'] = load
            route_check(state, graph, seed, orders)
        print('Source and retained routes verified; expanding domain...', flush=True)
        domain = build_domain(state, graph, replace(DynamicLimits(), domain_seconds=args.seconds, per_query_seconds=15., max_proposals=192), config, seeds)
        (output / 'domain.json').write_text(json.dumps(domain), encoding='utf-8')
        # Independent raw validation of ALL candidate paths before selection.
        for column in domain['columns']:
            route_check(state, graph, column, orders)
        try:
            selected, report = select_diverse(domain['columns'], [v.vehicle_id for v in state.vehicles], list(orders), config)
        except ValueError as error:
            (output / 'report.json').write_text(json.dumps({'status': 'INSUFFICIENT_DISTINCT_PLANS', 'message': str(error), 'columns': len(domain['columns'])}), encoding='utf-8')
            raise
    report.update(status='PASS', scenario=args.scenario, source_hashes=hashes, domain_sha256=domain['content_sha256'], validation='RAW_ROUTE_CHECK_ALL_COLUMNS', columns=len(domain['columns']))
    report['selected_metrics'] = {p: item['metrics'] for p, item in selected.items()}
    report['pairwise_edge_difference'] = {f'{a}/{b}': difference(selected[a]['routes'], selected[b]['routes'])
        for a, b in combinations(('FASTEST','BALANCED','SAFER'), 2)}
    revision = sha({'policy': VERSION, 'source_hashes': hashes, 'domain': domain['content_sha256'],
                    'implementation': {p: (root / p).read_text() for p in ['optimization/diverse_offline.py','optimization/solver/diverse_profiles.py','optimization/solver/profile_paths.py']}})
    new_pack = {k: deepcopy(pack[k]) for k in ('scenarioId','phase','fixtureSha256','initialState','sourceTime')}
    new_pack.update(validated=True, validationScope='RAW_VALIDATED_DIVERSE_OFFLINE', alternatives=[])
    for profile in ('FASTEST','BALANCED','SAFER'):
        item = selected[profile]
        new_pack['alternatives'].append({'schema_version':'task02-m2-runtime-witness/2','scenario_id':args.scenario,'profile':profile,
            'status':'FEASIBLE','source_hashes':hashes,'domain_sha256':domain['content_sha256'], 'metric_scope':'PLANNED_SUFFIX_ONLY',
            'served_orders':sorted(orders),'unserved_orders':[],'vehicle_routes':[browser_route(r) for r in item['routes']],'metrics':item['metrics']})
    asset = root / 'frontend/src/mocks/data/member2-diverse-road-packs.json'
    new_pack['buildSha256'] = revision
    retained = []
    if asset.exists():
        prior = json.loads(asset.read_text(encoding='utf-8'))
        if prior.get('schemaVersion') == 'm4-diverse-road-packs/1' and prior.get('policyVersion') == VERSION:
            retained = [p for p in prior['packs'] if p['scenarioId'] != args.scenario]
    bundle = {'schemaVersion':'m4-diverse-road-packs/1','policyVersion':VERSION,'buildSha256':revision,'executionMode':'SIMULATED_REPLAY','packs':retained + [new_pack]}
    (output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    temp = asset.with_suffix('.tmp')
    temp.write_text(json.dumps(bundle, separators=(',', ':')), encoding='utf-8')
    temp.replace(asset)
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
