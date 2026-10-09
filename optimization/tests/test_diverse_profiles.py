import unittest
from optimization.solver.diverse_profiles import select_diverse, difference

CONFIG = {'references': {'travel_time_s': 10, 'distance_m': 10, 'relative_exposure_proxy': 10},
          'profiles': {'FASTEST': {'time': 1, 'risk': 0, 'distance': 0},
                       'BALANCED': {'time': .6, 'risk': .4, 'distance': 0},
                       'SAFER': {'time': 0, 'risk': 1, 'distance': 0}}}


def route(name, time, risk, vehicle='V1'):
    return {'vehicle_id': vehicle, 'order_sequence': ['O1'],
            'actions': [{'kind': 'EDGE', 'edge_id': name}],
            'total_travel_time_s': time, 'total_exposure': risk,
            'total_distance_m': 10, 'total_cost_vnd': 10, 'total_soft_lateness_s': 0}


class DiverseProfilesTest(unittest.TestCase):
    def test_real_tradeoffs(self):
        selected, report = select_diverse([route('fast',10,12), route('middle',11,10), route('safe',12,8)], ['V1'], ['O1'], CONFIG)
        self.assertEqual(selected['FASTEST']['metrics']['total_travel_time_s'], 10)
        self.assertEqual(selected['BALANCED']['metrics']['total_travel_time_s'], 11)
        self.assertEqual(selected['SAFER']['metrics']['total_exposure'], 8)
        self.assertEqual(report['pareto_fleets'], 3)

    def test_rejects_duplicates_and_vehicle_swaps(self):
        with self.assertRaisesRegex(ValueError, 'INSUFFICIENT_DISTINCT_PLANS'):
            select_diverse([route('same',10,10), route('same',10,10,'V2')], ['V1','V2'], ['O1'], CONFIG)

    def test_rejects_dominated_detours(self):
        with self.assertRaisesRegex(ValueError, 'INSUFFICIENT_DISTINCT_PLANS'):
            select_diverse([route('best',10,10), route('bad',11,11), route('worse',12,12)], ['V1'], ['O1'], CONFIG)

    def test_quality_bound_and_full_coverage(self):
        with self.assertRaises(ValueError):
            select_diverse([route('fast',10,12), route('middle',20,10), route('safe',30,8)], ['V1'], ['O1'], CONFIG)
        with self.assertRaises(ValueError):
            select_diverse([route('partial',10,12)], ['V1'], ['O1','O2'], CONFIG)

    def test_profile_ids_are_not_route_diversity(self):
        self.assertEqual(difference([route('same',10,10)], [route('same',11,9)]), 0)


if __name__ == '__main__':
    unittest.main()
