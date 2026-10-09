"""Local handoff-layout verifier; no network, solver, Drive or authority writes.

Optional assembly creates only a NEW local installation, preserving every
approved runtime byte and its original relative path.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
import zipfile

BUILD = '80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41'
RT = 'SafeRouteVN_TASK02_Step7_Final_Release_Runtime_Windows_20261004.zip'
IT = 'SafeRouteVN_TASK02_Step7_Final_Release_Integration_Windows_20261004.zip'
PINS = {
    RT: 'd5345e75db2b41914cf4d0ed96a83e50e9c251637065ae1264eb1f33f41cbe4e',
    IT: 'd59917dded655398a04f3856d1ae73c658cc3dec3002a3467fb24e8d4a45b5e7',
    'STEP7_DELIVERY_RECEIPT_20261004.json': '551fd7e12c6c99f540c81a6a9b0f206d23b0adda749bf0308973ad1695edf2e8',
}
EXISTING = {
    'optimization/integration/member1_api_contract_projection.py',
    'shared/contracts/__init__.py',
    'shared/contracts/task02_api_v1.py',
    'shared/contracts/task02_api_v1.schema.json',
}

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def target(name):
    if name.startswith('examples/'):
        return 'shared/' + name
    return {
        'DISTRIBUTION_MANIFEST.json': 'docs/STEP7_DISTRIBUTION_MANIFEST_20261004.json',
        'INSTALL_UPLOAD_ALLOWLIST.json': 'docs/STEP7_INSTALL_UPLOAD_ALLOWLIST_20261004.json',
        'production_inventory.json': 'docs/STEP7_PRODUCTION_INVENTORY_20261004.json',
        'RUNTIME_INSTALL_README.md': 'docs/RUNTIME_INSTALL_README.md',
    }.get(name, name)

def safe(root, relative):
    if not isinstance(relative, str):
        raise ValueError('LAYOUT_PATH_TYPE')
    p = PurePosixPath(relative)
    if p.is_absolute() or '..' in p.parts or '\\' in relative or ':' in relative:
        raise ValueError('LAYOUT_PATH_UNSAFE: ' + relative)
    file = root.joinpath(*p.parts)
    if file.is_symlink() or not file.resolve().is_relative_to(root):
        raise ValueError('LAYOUT_SYMLINK: ' + relative)
    return file

def zip_members(z):
    names = z.namelist()
    if len(names) != len(set(names)) or any(x.endswith('/') for x in names):
        raise ValueError('ARCHIVE_FILE_SET_INVALID')
    for name in names:
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or '\\' in name or ':' in name:
            raise ValueError('ARCHIVE_PATH_UNSAFE')
    if z.testzip() is not None:
        raise ValueError('ARCHIVE_CRC')
    return names

def inventory_domain(root):
    paths = set()
    for p in (root / 'optimization').rglob('*'):
        r = p.relative_to(root)
        if p.is_file() and p.suffix in ('.py', '.json') and not {'tests', 'evaluation', '__pycache__'}.intersection(r.parts):
            paths.add(r.as_posix())
    paths.update(p.relative_to(root).as_posix() for p in (root / 'configs').rglob('*.json') if p.is_file())
    paths.update(p.relative_to(root).as_posix() for p in (root / 'optimization/runtime').glob('*.mjs') if p.is_file())
    for name in ('shared/__init__.py', 'shared/contracts/__init__.py', 'shared/contracts/task02_api_v1.py', 'shared/contracts/task02_api_v1.schema.json', 'runtime_entry.py', 'requirements-runtime.lock.txt'):
        if (root / name).is_file():
            paths.add(name)
    return paths

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--check-upload-kit', action='store_true', help='Permit exactly the four files already on Drive to be absent; this is not a complete-runtime certificate.')
    parser.add_argument('--assemble-runtime', type=Path, help='Create a NEW installation outside project-root. Requires a complete local team tree, including existing frozen files.')
    args = parser.parse_args()
    root = args.project_root.resolve()
    if args.check_upload_kit and args.assemble_runtime is not None:
        raise ValueError('ASSEMBLY_REQUIRES_COMPLETE_TEAM_TREE')
    for name, digest in PINS.items():
        file = safe(root, 'docs/' + name)
        if not file.is_file() or sha(file.read_bytes()) != digest:
            raise ValueError('SEALED_FILE_CHANGED: docs/' + name)
    mapping = json.loads(safe(root, 'docs/M2_STEP7_UPLOAD_MAP_20261004.json').read_bytes())
    if mapping.get('build_sha256') != BUILD:
        raise ValueError('LAYOUT_BUILD_MISMATCH')
    map_paths = []
    for row in mapping['files']:
        relative = row['team_relative_path']
        map_paths.append(relative)
        file = safe(root, relative)
        if args.check_upload_kit and row['action'] == 'KEEP_EXISTING_IDENTICAL' and not file.exists():
            continue
        if not file.is_file():
            raise ValueError('TEAM_FILE_MISSING: ' + relative)
        b = file.read_bytes()
        if len(b) != row['bytes'] or sha(b) != row['sha256']:
            raise ValueError('TEAM_FILE_CHANGED: ' + relative)
    if len(map_paths) != len(set(map_paths)):
        raise ValueError('DUPLICATE_LAYOUT_DESTINATION')
    with zipfile.ZipFile(root / 'docs' / IT) as it:
        zip_members(it)
        flow = 'optimization/tests/runtime_m4_flow.mjs'
        if safe(root, flow).read_bytes() != it.read(flow):
            raise ValueError('M4_REFERENCE_CHANGED')
    with zipfile.ZipFile(root / 'docs' / RT) as rt:
        names = zip_members(rt)
        if len(names) != 149:
            raise ValueError('RUNTIME_ENTRY_COUNT')
        absent = []
        for name in names:
            relative = target(name)
            file = safe(root, relative)
            if args.check_upload_kit and name in EXISTING and not file.exists():
                absent.append(name)
                continue
            if not file.is_file() or file.read_bytes() != rt.read(name):
                raise ValueError('RUNTIME_SOURCE_CHANGED: ' + relative)
        record = json.loads(rt.read('production_inventory.json'))
        body = {k: v for k, v in record.items() if k != 'build_sha256'}
        canonical = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
        if record['build_sha256'] != BUILD or sha(canonical) != BUILD:
            raise ValueError('APPROVED_INVENTORY_CHANGED')
        team_inventory_matches = None
        if not args.check_upload_kit:
            expected = set(record['files'])
            actual = inventory_domain(root)
            team_inventory_matches = actual == expected
            for name, pin in record['files'].items():
                b = safe(root, name).read_bytes()
                if len(b) != pin['bytes'] or sha(b) != pin['sha256']:
                    raise ValueError('PRODUCTION_PIN_CHANGED: ' + name)
        assembled = None
        if args.assemble_runtime is not None:
            destination = args.assemble_runtime.resolve()
            if destination.exists() or destination.is_relative_to(root) or root.is_relative_to(destination):
                raise ValueError('ASSEMBLY_DESTINATION_MUST_BE_NEW_AND_OUTSIDE_TEAM_TREE')
            if not destination.parent.is_dir():
                raise ValueError('ASSEMBLY_PARENT_MISSING')
            stage = Path(tempfile.mkdtemp(prefix='.m2_step7_assemble_', dir=destination.parent))
            for name in names:
                file = stage.joinpath(*PurePosixPath(name).parts)
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(safe(root, target(name)).read_bytes())
                if file.read_bytes() != rt.read(name):
                    raise ValueError('ASSEMBLY_BYTE_MISMATCH: ' + name)
            if inventory_domain(stage) != set(record['files']):
                raise ValueError('ASSEMBLY_INVENTORY_DOMAIN_MISMATCH')
            if destination.exists():
                raise ValueError('ASSEMBLY_DESTINATION_ALREADY_EXISTS')
            os.rename(stage, destination)
            assembled = str(destination)
        print(json.dumps({
            'status': 'UPLOAD_KIT_VERIFIED' if args.check_upload_kit else 'TEAM_HANDOFF_BYTES_VERIFIED',
            'runtime_entries': 149, 'runtime_entries_checked': len(names) - len(absent),
            'already_on_drive_not_bundled': absent, 'inventory_pins': len(record['files']),
            'team_root_production_inventory_matches': team_inventory_matches,
            'build_sha256': BUILD, 'assembled_runtime': assembled,
            'native_solver_or_windows_attestation_performed': False, 'drive_changed': False,
        }, ensure_ascii=False))

if __name__ == '__main__':
    try:
        run()
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile) as error:
        print(json.dumps({'status': 'HANDOFF_CHECK_FAILED', 'error': str(error)}, ensure_ascii=False))
        raise SystemExit(2)
