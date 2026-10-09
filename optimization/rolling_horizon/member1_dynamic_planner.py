"""Bounded raw turn-state route columns for own S2/S3 plans and suffixes.

Physical action wire is internal /1 (not static legs cardinality). ONBOARD
ownership is never changed. Multiple depot visits explicitly carry pickups.
No producer routine here is imported by the independent action validator.
"""
from copy import deepcopy
from dataclasses import dataclass
from decimal import Decimal
from itertools import combinations,permutations
from time import monotonic
from optimization.models.member1_dynamic_state import DynamicError,require,sha,RESULT_VERSION,OBJECTIVE_VERSION,SOLVER_VERSION
from optimization.models.decision_state import OrderState
from optimization.rolling_horizon.member1_motion_replay import _parse_time,_offset_us,_ceil_us
from optimization.solver.member1_dynamic_master import select_columns
from optimization.integration.member1_path_foundation import CandidateFoundationLimits,find_time_source_witness

PLANNER_VERSION=SOLVER_VERSION
DOMAIN_VERSION='task02-m1-dynamic-physical-domain/1'

@dataclass(frozen=True)
class DynamicLimits:
    domain_seconds:float=600.
    per_query_seconds:float=15.
    max_road_states:int=250000
    max_road_labels:int=500000
    max_arrival_options:int=2
    max_proposals:int=96
    max_columns:int=512
    master_seconds:float=60.
    def __post_init__(self):
        from optimization.models.member1_dynamic_state import finite_tree
        from dataclasses import asdict
        finite_tree(asdict(self))
        for k,v in asdict(self).items():
            require(type(v) is (int if k.startswith('max_') else float) and v>0,'INVALID_DATA',f'limits.{k}','positive typed limit required')

class Columns:
    def __init__(self,state,graph,limits):
        self.state,self.graph,self.limits=state,graph,limits
        self.deadline=monotonic()+limits.domain_seconds;self.cache={};self.traces=[];self.columns=[];self.keys=set();self.proposals=0
        self.epoch=_parse_time(state.decision_epoch,'decision_epoch');self.orders={o.order_id:o for o in state.orders}
    def paths(self,node,target,incoming,objective):
        if node==target:return [None]
        key=(node,target,incoming,objective)
        if key in self.cache:return self.cache[key]
        if monotonic()>=self.deadline:
            self.traces.append({'origin':node,'destination':target,'incoming_edge':incoming,'objective':objective,'status':'NOT_STARTED_GLOBAL_DEADLINE'});return []
        query_deadline=min(self.deadline,monotonic()+self.limits.per_query_seconds)
        common=dict(incoming_edge=incoming,max_road_states=self.limits.max_road_states,max_road_labels=self.limits.max_road_labels,max_arrival_options=1 if objective=='time' else self.limits.max_arrival_options,deadline=query_deadline)
        try:
            result=find_time_source_witness(self.graph,node,target,incoming_edge=incoming,limits=CandidateFoundationLimits(max_states_per_search=self.limits.max_road_states,max_labels_per_search=self.limits.max_road_labels),deadline=query_deadline) if objective=='time' else self.graph.find_objective_paths(node,target,objective=objective,**common)
        except ValueError as e:
            self.traces.append({'origin':node,'destination':target,'incoming_edge':incoming,'objective':objective,'status':'PATH_SOURCE_INVALID','message':str(e)})
            failure=DynamicError('PATH_SOURCE_INVALID','domain.queries',str(e));failure.traces=deepcopy(self.traces)
            raise failure from e
        self.traces.append({'origin':node,'destination':target,'incoming_edge':incoming,'objective':objective,'stage':'SOURCE_ASTAR_WITNESS' if objective=='time' else 'OBJECTIVE_SEARCH','option_count':len(result.paths),'limit':result.limit,'settled_states':result.settled_states,'generated_labels':result.generated_labels,'resource_prunes':getattr(result,'resource_prunes',None),'dominated_prunes':result.dominated_prunes})
        options=list(result.paths)
        if objective=='time' and self.limits.max_arrival_options>1 and monotonic()<query_deadline:
            # Retain the first authenticated witness through bounded Pareto
            # refinement failure. This does not relabel it as a second option.
            common['max_arrival_options']=self.limits.max_arrival_options
            common['deadline']=min(query_deadline,monotonic()+2.)
            try:refined=self.graph.find_paths(node,target,**common)
            except ValueError as e:
                self.traces.append({'origin':node,'destination':target,'incoming_edge':incoming,'objective':objective,'stage':'ARRIVAL_STATE_REFINEMENT','status':'PATH_SOURCE_INVALID','retained_candidate_count':len(options),'message':str(e)})
                failure=DynamicError('PATH_SOURCE_INVALID','domain.queries',str(e));failure.traces=deepcopy(self.traces)
                raise failure from e
            self.traces.append({'origin':node,'destination':target,'incoming_edge':incoming,'objective':'time','stage':'ARRIVAL_STATE_REFINEMENT','option_count':len(refined.paths),'limit':refined.limit,'settled_states':refined.settled_states,'generated_labels':refined.generated_labels,'resource_prunes':refined.resource_prunes,'dominated_prunes':refined.dominated_prunes})
            for p in refined.paths:
                if all(p.edge_ids!=x.edge_ids for x in options):options.append(p)
        self.cache[key]=options;return options
    def edge_action(self,edge_id,start,*,fraction=0.,incoming=None):
        edge=self.graph._checked_edge(self.graph.edge(edge_id));duration=_ceil_us(Decimal(str(edge['travelTimeHours']))*3600,'edge.travel_time')
        remaining=duration-round(duration*fraction)
        return {'kind':'EDGE','edge_id':edge_id,'from_node':edge['fromNodeId'],'to_node':edge['toNodeId'],'incoming_edge':incoming,'start_us':start,'end_us':start+remaining,'fraction_start':fraction,'fraction_end':1.,'distance_m':edge['lengthKm']*1000*(1-fraction),'exposure':edge['relativeExposure']*(1-fraction),'geometry':[[p.longitude,p.latitude] for p in edge['points']],'feature_payload':edge['payload']}
    def paths_at(self,node,target,incoming,objective,departure_us):
        """Additive realization seam; legacy proposals ignore departure."""
        return self.paths(node,target,incoming,objective)
    def finish_committed_edge(self,action,commitment):
        """Legacy Motion1 holds its baseline completion timestamp."""
        action['end_us']=commitment['until_us']
        return action
    def initial_edge_progress(self,snapshot,clock):
        return snapshot['position']['progress']
    def realize(self,vehicle,sequence,*,snapshot=None,decision_time=None,fulfilled_ids=(),pickup_ids=(),objective='time',limit=2):
        self.proposals+=1
        if self.proposals>self.limits.max_proposals or len(self.columns)>=self.limits.max_columns:return []
        depot=self.state.depot.graph_node_id
        off=lambda t:_offset_us(self.epoch,t,'time',signed=True)
        upper=min(off(self.state.depot.closing_time),off(vehicle.working_end))
        begin=max(0,off(vehicle.working_start),off(self.state.depot.opening_time)) if snapshot is None else off(decision_time or snapshot['position_timestamp'])
        if vehicle.availability!='AVAILABLE' or snapshot is not None and snapshot['availability']!='AVAILABLE':return []
        if begin>upper:return []
        node=depot if snapshot is None else snapshot['position'].get('node_id',snapshot['position'].get('from_node'))
        anchor=node
        incoming=None if snapshot is None else snapshot['position'].get('incoming_edge')
        load=vehicle.current_load_kg if snapshot is None else snapshot['current_load_kg']
        onboard=set(vehicle.onboard_order_ids if snapshot is None else snapshot['onboard_order_ids'])
        range_m=vehicle.remaining_range_m if snapshot is None else snapshot['remaining_range_m']
        actions=[];clock=begin
        if clock<off(vehicle.working_start):
            actions.append({'kind':'WAIT','node_id':node,'start_us':clock,'end_us':off(vehicle.working_start)})
            clock=off(vehicle.working_start)
        if snapshot is not None and snapshot.get('explicit_committed_stop_id') is not None:
            commit=snapshot['explicit_committed_stop_id']
            if commit not in fulfilled_ids and (not sequence or sequence[0]!=commit):return []
        committed=snapshot.get('active_commitment') if snapshot else None
        if committed:
            if committed['kind']=='EDGE':
                a=self.edge_action(committed['edge_id'],clock,fraction=self.initial_edge_progress(snapshot,clock),incoming=incoming)
                a=self.finish_committed_edge(a,committed);actions.append(a);clock=a['end_us'];node=a['to_node'];incoming=a['edge_id']
            elif committed['kind']=='SERVICE':
                oid=committed['order_id'];o=self.orders[oid]
                actions.append({'kind':'SERVICE','order_id':oid,'node_id':node,'start_us':clock,'end_us':committed['until_us'],'continuation':True,'load_after_kg':load-o.demand_kg})
                clock=committed['until_us'];load-=o.demand_kg;onboard.remove(oid);sequence=[x for x in sequence if x!=oid]
        operations=[]
        if snapshot is None and pickup_ids:operations.append(('PICKUP',tuple(pickup_ids)))
        for oid in sequence:
            if oid in pickup_ids and snapshot is not None and not any(k=='PICKUP' for k,_ in operations):operations.append(('PICKUP',tuple(pickup_ids)))
            operations.append(('SERVICE',oid))
        operations.append(('RETURN',None));found=[]
        def visit(i,local,previous,t,carried,cargo,acts):
            if monotonic()>=self.deadline or len(found)>=limit:return
            kind,identity=operations[i]
            target=depot if kind in ('PICKUP','RETURN') else self.orders[identity].graph_node_id
            for path in self.paths_at(local,target,previous,objective,t):
                nextacts=list(acts);now=t;last=previous
                if path is not None:
                    for eid in path.edge_ids:
                        a=self.edge_action(eid,now,incoming=last);nextacts.append(a);now=a['end_us'];last=eid
                distance=sum(a.get('distance_m',0.) for a in nextacts)
                if distance>range_m+1e-7 or now>upper:continue
                newcargo=set(cargo);newload=carried
                if kind=='RETURN':
                    route={'vehicle_id':vehicle.vehicle_id,'order_sequence':[a['order_id'] for a in nextacts if a['kind']=='SERVICE'],
                        'actions':nextacts,'start_us':begin,'return_us':now,'start_node':anchor,'end_node':depot,'return_load_kg':newload,
                        'total_distance_m':distance,'total_travel_time_s':sum((a['end_us']-a['start_us'])/1e6 for a in nextacts if a['kind']=='EDGE'),
                        'total_exposure':sum(a.get('exposure',0.) for a in nextacts),'total_cost_vnd':distance/1000*vehicle.cost_per_km_vnd,
                        'total_soft_lateness_s':sum(max(0,(a['end_us']-off(self.orders[a['order_id']].preferred_due))/1e6) for a in nextacts if a['kind']=='SERVICE')}
                    route['route_column_id']='dynamic-'+sha(route)[:24];found.append(route);continue
                if kind=='PICKUP':
                    # Customer earliest is not a depot-ready timestamp. Initial
                    # WAITING cargo is ready at epoch; only a newly born event
                    # order uses the Leader's synthetic event-time readiness.
                    ready=max(now,off(self.state.depot.opening_time),off(decision_time) if decision_time and any(x not in {o.order_id for o in self.state.orders} for x in identity) else 0)
                    if ready>now:nextacts.append({'kind':'WAIT','node_id':depot,'start_us':now,'end_us':ready})
                    now=ready
                    if now>upper:continue
                    for oid in identity:
                        if oid in newcargo:raise DynamicError('CUSTODY_OWNER','pickup','duplicate pickup')
                        newcargo.add(oid);newload+=self.orders[oid].demand_kg
                        nextacts.append({'kind':'PICKUP','order_id':oid,'node_id':depot,'start_us':now,'end_us':now,'load_after_kg':newload})
                    if newload>vehicle.capacity_kg+1e-9:continue
                else:
                    o=self.orders[identity]
                    if identity not in newcargo:continue
                    start=max(now,off(o.earliest))
                    if start>now:nextacts.append({'kind':'WAIT','node_id':target,'start_us':now,'end_us':start})
                    now=start+_ceil_us(o.service_time_seconds,'service')
                    if now>off(o.hard_deadline) or now>upper:continue
                    newload-=o.demand_kg;newcargo.remove(identity)
                    nextacts.append({'kind':'SERVICE','order_id':identity,'node_id':target,'start_us':start,'end_us':now,'continuation':False,'load_after_kg':newload})
                visit(i+1,target,last,now,newload,newcargo,nextacts)
        visit(0,node,incoming,clock,load,onboard,actions)
        for route in found:
            key=sha(route)
            if key not in self.keys:self.keys.add(key);self.columns.append(route)
        return found
    def domain(self,before=None):
        value={'schema_version':DOMAIN_VERSION,'planner_version':PLANNER_VERSION,'scenario_id':self.state.scenario_id,'initial_state_sha256':sha(self.state.to_dict()),'source_hashes':self.graph.source_hashes,'source_versions':{'routing':self.graph.routing_version,'features':self.graph.features_version,'context':self.graph.context_version},'anchor_state_sha256':before.get('content_sha256') if before else None,'limits':__import__('dataclasses').asdict(self.limits),'columns':self.columns,'queries':self.traces,'proposals_attempted':min(self.proposals,self.limits.max_proposals),'coverage_complete':False,'finite_path_domain':True}
        value['content_sha256']=sha(value);return value

def pre_domain(state,graph,limits,*,_builder=None):
    # Change Impact Analysis: optional internal runtime observer/builder seam.
    # Legacy default remains Columns, identical proposal/cap/output policy.
    build=Columns(state,graph,limits) if _builder is None else _builder;orders=sorted(state.orders,key=lambda o:o.order_id)
    def full_pool():
        universe={o.order_id for o in orders}
        eligible=[c for c in build.columns if state.scenario_id!='S3' or c['vehicle_id']!='V1' or any(a['kind']=='SERVICE' and a['order_id']=='O001' and a['end_us']>900_000_000 for a in c['actions'])]
        for a in eligible:
            for b in eligible:
                if a['vehicle_id']!=b['vehicle_id'] and not set(a['order_sequence'])&set(b['order_sequence']) and set(a['order_sequence'])|set(b['order_sequence'])==universe:return True
        return any(set(c['order_sequence'])==universe for c in eligible)
    # Deterministic capacity-balanced subset proposals; S3 O001-last is a
    # disclosed synthetic test selection rule, not a dispatch policy.
    subsets=[]
    for size in range(1,len(orders)+1):
        for subset in combinations(orders,size):
            mass=sum(o.demand_kg for o in subset)
            if mass<=max(v.capacity_kg for v in state.vehicles):subsets.append((abs(mass-sum(o.demand_kg for o in orders)/2),tuple(o.order_id for o in subset)))
    subsets.sort()
    for _,ids in subsets:
        for v in state.vehicles:
            mandatory={o.order_id for o in orders if o.status=='ONBOARD' and o.assigned_vehicle_id==v.vehicle_id}
            if not mandatory.issubset(ids) or any(o.status=='ONBOARD' and o.assigned_vehicle_id!=v.vehicle_id for o in orders if o.order_id in ids):continue
            if sum(build.orders[x].demand_kg for x in ids)>v.capacity_kg:continue
            nearest=[];left=set(ids);coordinates=state.depot.coordinates
            while left:
                oid=min(left,key=lambda x:(sum((a-b)**2 for a,b in zip(build.orders[x].coordinates,coordinates)),x));nearest.append(oid);left.remove(oid);coordinates=build.orders[oid].coordinates
            if state.scenario_id=='S3' and 'O001' in nearest:nearest=[x for x in nearest if x!='O001']+['O001']
            for seq in (nearest,list(reversed(nearest))):
                if state.scenario_id=='S3' and 'O001' in seq:seq=[x for x in seq if x!='O001']+['O001']
                build.realize(v,seq,pickup_ids=[x for x in seq if build.orders[x].status=='WAITING'])
                if full_pool():break
                if build.proposals>=limits.max_proposals or monotonic()>=build.deadline:break
            if full_pool():break
            if build.proposals>=limits.max_proposals or monotonic()>=build.deadline:break
        if full_pool():break
        if build.proposals>=limits.max_proposals or monotonic()>=build.deadline:break
    if state.scenario_id=='S3':
        # Remove only columns violating the explicit witness-selection test,
        # never alter an order's observed delivered state after replay.
        build.columns=[c for c in build.columns if c['vehicle_id']!='V1' or any(a['kind']=='SERVICE' and a['order_id']=='O001' and a['end_us']>900_000_000 for a in c['actions'])]
    value=build.domain();value.pop('content_sha256',None)
    value['stop_reason']='FULL_INITIAL_WITNESS_POOL_FOUND' if full_pool() else 'BOUNDED_PREPLAN_SEARCH_STOPPED'
    value['content_sha256']=sha(value);return value

def post_domain(state,graph,after,limits,*,_builder=None):
    # Private additive seam for a versioned temporal edge realizer. Public
    # legacy defaults, proposal policy, caps and physical custody are unchanged.
    build=Columns(state,graph,limits) if _builder is None else _builder
    if 'event_order' in after:
        order=OrderState.from_dict(after['event_order']);build.orders[order.order_id]=order
    waiting=[o['order_id'] for o in after['orders'] if o['status']=='WAITING']
    for v in state.vehicles:
        snapshot=next(x for x in after['vehicles'] if x['vehicle_id']==v.vehicle_id)
        if snapshot['availability']!='AVAILABLE':continue
        # Keep a physical return/active-service continuation even when no
        # additional delivery proposal is feasible. Cargo is NOT unloaded.
        # An unfulfilled explicit stop still prevents a return-only option.
        build.realize(v,[],snapshot=snapshot,decision_time=after['current_time'],fulfilled_ids=[o['order_id'] for o in after['orders'] if o['status']=='DELIVERED'])
        onboard=list(snapshot['onboard_order_ids']);seed=[x for x in snapshot['planned_suffix'] if x in onboard]
        seed+=sorted(set(onboard)-set(seed))
        candidates=[seed,list(reversed(seed))]
        if len(seed)<=5:candidates+=list(map(list,permutations(seed)))
        unique=[]
        for seq in candidates:
            if seq not in unique:unique.append(seq)
        for seq in unique:
            for ids in (waiting,[]):
                build.realize(v,seq+ids,snapshot=snapshot,decision_time=after['current_time'],fulfilled_ids=[o['order_id'] for o in after['orders'] if o['status']=='DELIVERED'],pickup_ids=ids)
                if build.proposals>=limits.max_proposals or monotonic()>=build.deadline:break
            if build.proposals>=limits.max_proposals or monotonic()>=build.deadline:break
    # Stable presentation: service options precede pure-return options; both
    # remain physical model choices, including zero-service required columns.
    build.columns.sort(key=lambda c:not bool(c['order_sequence']))
    return build.domain(after)

def solve_domain(state,domain,config,profile,*,before=None,after=None):
    orders={o.order_id:o for o in state.orders}
    if after and 'event_order' in after:
        event_order=OrderState.from_dict(after['event_order']);orders[event_order.order_id]=event_order
    required=[]
    if after:
        delivered={o['order_id'] for o in after['orders'] if o['status']=='DELIVERED'}
        required=[v['vehicle_id'] for v in after['vehicles'] if v['availability']=='AVAILABLE' and (v['active_commitment'] is not None or v['position']['kind']=='ON_EDGE' or v['position'].get('node_id')!=state.depot.graph_node_id or v.get('explicit_committed_stop_id') is not None and v['explicit_committed_stop_id'] not in delivered)]
    master=select_columns(domain['columns'],{k:o.priority for k,o in orders.items()},[v.vehicle_id for v in state.vehicles],profile,config,seconds=60,required_vehicle_ids=required)
    routes=[deepcopy(domain['columns'][i]) for i in master['selected_route_indexes']]
    actual=sorted(o['order_id'] for o in (before or {}).get('orders',[]) if o['status']=='DELIVERED')
    planned=sorted(x for r in routes for x in r['order_sequence']);served=sorted(set(actual+planned));unserved=[]
    for oid in sorted(set(orders)-set(served)):
        observed=next((o for o in (after or {}).get('orders',[]) if o['order_id']==oid),None)
        blocked=observed and observed['status']=='ONBOARD' and any(v['vehicle_id']==observed['owner_vehicle_id'] and v['availability']=='UNAVAILABLE' for v in after['vehicles'])
        unserved.append({'order_id':oid,'reason':'CUSTODY_BLOCKED' if blocked else 'SEARCH_INCOMPLETE','owner_vehicle_id':observed['owner_vehicle_id'] if observed and observed['status']=='ONBOARD' else None})
    certified_no_service=bool(unserved) and not served and all(x['reason']=='CUSTODY_BLOCKED' for x in unserved)
    status='FEASIBLE' if not unserved else 'PARTIAL' if served else 'NO_SERVICE' if certified_no_service else 'SEARCH_LIMIT'
    result={'schema_version':RESULT_VERSION,'solver_version':PLANNER_VERSION,'objective_version':OBJECTIVE_VERSION,'scenario_id':state.scenario_id,'profile':profile,'domain_sha256':domain['content_sha256'],'initial_state_sha256':sha(state.to_dict()),'before_state_sha256':before.get('content_sha256') if before else None,'after_state_sha256':after.get('content_sha256') if after else None,'status':status,'actual_delivered':actual,'planned_served':planned,'served_orders':served,'unserved_orders':unserved,'vehicle_routes':routes,'post_event_state':None,'search':{'search_complete':False,'optimality_proven':False,'truncated':True,'termination_reason':'FINITE_BOUNDED_DOMAIN','master':master},'metrics':{k:sum(r[k] for r in routes) for k in ('total_distance_m','total_travel_time_s','total_exposure','total_cost_vnd','total_soft_lateness_s')}}
    result['no_service_certificate']={'kind':'ALL_REMAINING_CUSTODY_BLOCKED','order_ids':sorted(orders),'after_state_sha256':after['content_sha256']} if certified_no_service else None
    result['metric_scope']='SUFFIX_ONLY'
    if before:
        prefix=before['execution_metrics'];mapping={'total_distance_m':('distance_m',1),'total_travel_time_s':('travel_time_us',1000000),'total_exposure':('relative_exposure_proxy',1),'total_cost_vnd':('cost_vnd',1)}
        result['prefix_metrics']=deepcopy(prefix)
        result['whole_trajectory_metrics']={k:result['metrics'][k]+prefix[v]/scale for k,(v,scale) in mapping.items()}
        result['whole_trajectory_metrics']['total_soft_lateness_s']=result['metrics']['total_soft_lateness_s']+sum(max(0,(_parse_time(o['delivered_at'],'delivered_at')-_parse_time(orders[o['order_id']].preferred_due,'preferred_due')).total_seconds()) for o in before['orders'] if o['status']=='DELIVERED')
    return result
