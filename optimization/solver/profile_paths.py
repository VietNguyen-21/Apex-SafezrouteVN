"""Bounded scalar A* witnesses for offline profile comparisons.

Carries incoming edges through every junction. Selected paths are reconstructed
from raw edges and later independently validated; no optimality claim is made.
"""
import heapq
import math
from time import monotonic

from optimization.integration.member1_path_foundation import _great_circle_m
from optimization.rolling_horizon.member1_dynamic_planner import Columns


class ProfileColumns(Columns):
    def __init__(self, state, graph, limits, config):
        super().__init__(state, graph, limits)
        ref = config['references']
        self.weights = {
            'time': (1., 0.), 'exposure': (0., 1.),
            'balanced': (config['profiles']['BALANCED']['time'] / ref['travel_time_s'],
                         config['profiles']['BALANCED']['risk'] / ref['relative_exposure_proxy']),
        }
        self.bounds = {}
        for name, (time, risk) in self.weights.items():
            row = graph.db.execute(
                'SELECT MIN((?*f.travelTimeHours*3600.0+?*f.relativeExposure)/(e.lengthKm*1000.0)) '
                'FROM edges e JOIN costs.features f USING(edgeId) WHERE e.lengthKm>0',
                (time, risk)).fetchone()
            self.bounds[name] = max(0., float(row[0] or 0.))

    def paths(self, node, target, incoming, objective):
        if node == target:
            return [None]
        key = (node, target, incoming, objective)
        if key in self.cache:
            return self.cache[key]
        end = self.graph.node(target)
        if self.graph.node(node) is None or end is None:
            raise ValueError('Path endpoint absent')
        if incoming is not None and self.graph.edge(incoming)['toNodeId'] != node:
            raise ValueError('Invalid incoming edge')
        time_weight, risk_weight = self.weights[objective]
        deadline = min(self.deadline, monotonic() + self.limits.per_query_seconds)
        def heuristic(n):
            return _great_circle_m(self.graph.node(n), end) * self.bounds[objective]
        initial = (node, incoming)
        best, parents = {initial: (0., 0.)}, {}
        heap = [(heuristic(node), 0., 0., 0, initial)]
        serial = settled = 0
        options, status = [], 'EXHAUSTED'
        while heap:
            if monotonic() >= deadline:
                status = 'TIME_LIMIT'
                break
            _, cost, travel, _, state = heapq.heappop(heap)
            if best.get(state) != (cost, travel):
                continue
            settled += 1
            if settled > self.limits.max_road_states or serial > self.limits.max_road_labels:
                status = 'SEARCH_LIMIT'
                break
            if state[0] == target:
                chain, cursor = [], state
                while cursor != initial:
                    cursor, edge = parents[cursor]
                    chain.append(edge)
                options = [self.graph._assemble(list(reversed(chain)), node)]
                status = 'WITNESS_FOUND'
                break
            for raw in self.graph._outgoing(state[0]):
                if (state[1], raw['edgeId']) in self.graph.forbidden:
                    continue
                seconds, risk = raw['travelTimeHours'] * 3600., raw['relativeExposure']
                if any(not math.isfinite(v) or v < 0 for v in (seconds, risk)):
                    raise ValueError('Invalid raw edge cost')
                values = (cost + time_weight * seconds + risk_weight * risk, travel + seconds)
                following = (raw['toNodeId'], raw['edgeId'])
                if values >= best.get(following, (math.inf, math.inf)):
                    continue
                best[following], parents[following] = values, (state, raw)
                serial += 1
                heapq.heappush(heap, (values[0] + heuristic(following[0]), *values, serial, following))
        self.traces.append(dict(origin=node, destination=target, incoming_edge=incoming,
                                objective=objective, stage='SCALAR_PROFILE_ASTAR', status=status,
                                option_count=len(options), settled_states=settled, generated_labels=serial))
        self.cache[key] = options
        return options
