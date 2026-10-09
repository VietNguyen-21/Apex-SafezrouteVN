"""Explicit production inventory, including parent initializers and assets.

Change Impact Analysis: new runtime build identity only. No historical checker
receipt or legacy code hash is modified. Trust is external to this inventory.
"""
import ast,hashlib,json
from pathlib import Path,PurePosixPath
from importlib.util import resolve_name
from .protocol import require,digest,sha

VERSION='task02-m2-runtime-production-inventory/1'

def pin(path):
    return {'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def production_inventory(repo):
    """Conservative declared superset for lazy imports, not import tracing alone.

    Includes every non-test optimization module and model asset, protected
    config JSON, and frozen API production files. Evaluation is not runtime.
    """
    repo=Path(repo);paths=set()
    for p in (repo/'optimization').rglob('*'):
        r=p.relative_to(repo)
        if p.is_file() and p.suffix in ('.py','.json') and not {'tests','evaluation','__pycache__'}.intersection(r.parts):paths.add(r.as_posix())
    for p in (repo/'configs').rglob('*.json'):paths.add(p.relative_to(repo).as_posix())
    for p in (repo/'optimization/runtime').glob('*.mjs'):paths.add(p.relative_to(repo).as_posix())
    for r in ('shared/__init__.py','shared/contracts/__init__.py','shared/contracts/task02_api_v1.py','shared/contracts/task02_api_v1.schema.json'):
        if (repo/r).is_file():paths.add(r)
    if (repo/'runtime_entry.py').is_file():paths.add('runtime_entry.py')
    require((repo/'requirements-runtime.lock.txt').is_file(),'BUILD_CLOSURE','requirements-runtime.lock.txt','dependency lock required')
    paths.add('requirements-runtime.lock.txt')
    require(bool(paths),'BUILD_CLOSURE','files','empty production inventory')
    # Validate all statically visible local edges, including package imports.
    for r in sorted(paths):
        if not r.endswith('.py'):continue
        package='.'.join(PurePosixPath(r).parent.parts)
        for node in ast.walk(ast.parse((repo/r).read_text(encoding='utf8'))):
            names=[]
            if isinstance(node,ast.Import):names=[a.name for a in node.names]
            elif isinstance(node,ast.ImportFrom):
                mod=resolve_name('.'*node.level+(node.module or ''),package) if node.level else node.module
                if mod:names=[mod]+[mod+'.'+a.name for a in node.names]
            for name in names:
                if not name.startswith(('optimization.','shared.')):continue
                base=name.replace('.','/');candidates=[base+'.py',base+'/__init__.py']
                existing=next((c for c in candidates if (repo/c).is_file()),None)
                if existing:
                    require(existing in paths,'BUILD_CLOSURE',existing,'local dependency absent from production inventory')
                    parts=PurePosixPath(existing).parent.parts
                    for i in range(1,len(parts)+1):
                        init='/'.join(parts[:i])+'/__init__.py'
                        if (repo/init).is_file():require(init in paths,'BUILD_CLOSURE',init,'parent initializer omitted')
    return {r:pin(repo/r) for r in sorted(paths)}

def inventory(repo):
    body={'schema_version':VERSION,'files':production_inventory(repo),'python':'3.12','platform':'Windows','dependencies':{'ortools':'9.15.6755','jsonschema':'4.25.1'}}
    body['build_sha256']=sha(body);return body

def verify(repo,record,expected_digest):
    digest(expected_digest,'expected_build_sha256')
    require(isinstance(record,dict) and record.get('schema_version')==VERSION,'BUILD_BINDING','inventory','known inventory required')
    body={k:v for k,v in record.items() if k!='build_sha256'}
    require(record.get('build_sha256')==expected_digest==sha(body),'BUILD_BINDING','build_sha256','expected digest must be installed separately by M3')
    require(record==inventory(repo),'BUILD_CHANGED','files','production bytes or dependency inventory changed')
    return record
