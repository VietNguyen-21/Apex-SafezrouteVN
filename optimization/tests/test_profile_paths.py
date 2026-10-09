import unittest
from types import SimpleNamespace
from time import monotonic

from optimization.solver.profile_paths import ProfileColumns
from optimization.rolling_horizon.member1_dynamic_planner import DynamicLimits
from optimization.tests.test_diverse_profiles import CONFIG


class Graph:
    def __init__(self):
        self.forbidden = set()
        self.db = SimpleNamespace(execute=lambda *args: SimpleNamespace(fetchone=lambda: (0.,)))
        # Three parallel roads offer a genuine speed/risk compromise.
        self.edges = [dict(edgeId=name, fromNodeId=1, toNodeId=2, travelTimeHours=t/3600., relativeExposure=r)
                      for name, t, r in [('fast', 10, 12), ('middle', 11, 10), ('safe', 12, 9)]]

    def node(self, n):
        return (0., 0.) if n in (0, 1, 2) else None

    def edge(self, eid):
        return next((e for e in self.edges if e['edgeId'] == eid), None)

    def _outgoing(self, n):
        return [e for e in self.edges if e['fromNodeId'] == n]

    def _assemble(self, edges, node):
        return SimpleNamespace(edge_ids=tuple(e['edgeId'] for e in edges))


class ProfilePathsTest(unittest.TestCase):
    def setUp(self):
        self.graph = Graph()
        state = SimpleNamespace(decision_epoch='2026-09-27T21:00:00+07:00', orders=[])
        self.builder = ProfileColumns(state, self.graph, DynamicLimits(), CONFIG)

    def test_objectives_produce_real_different_roads(self):
        for objective, edge in [('time', 'fast'), ('balanced', 'middle'), ('exposure', 'safe')]:
            self.assertEqual(self.builder.paths(1, 2, None, objective)[0].edge_ids, (edge,))

    def test_incoming_turn_restriction_is_carried_across_legs(self):
        self.graph.edges.append(dict(edgeId='incoming', fromNodeId=0, toNodeId=1))
        self.graph.forbidden.add(('incoming', 'fast'))
        self.assertEqual(self.builder.paths(1, 2, 'incoming', 'time')[0].edge_ids, ('middle',))
        # A different incoming edge must not reuse that restricted cache entry.
        self.assertEqual(self.builder.paths(1, 2, None, 'time')[0].edge_ids, ('fast',))

    def test_deadline_does_not_manufacture_a_witness(self):
        self.builder.deadline = monotonic() - 1
        self.assertEqual(self.builder.paths(1, 2, None, 'exposure'), [])
        self.assertEqual(self.builder.traces[-1]['status'], 'TIME_LIMIT')


if __name__ == '__main__':
    unittest.main()
