"""Bounded real SDK contention for Phase 7; never opens or changes the store."""
import argparse
import json
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=Path, required=True)
parser.add_argument('--installation-config', type=Path, required=True)
parser.add_argument('--control-dir', type=Path, required=True)
parser.add_argument('--expected-build', required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.source_root.resolve()))
from backend.services.sdk_access_lock import SdkAccessLock

config = json.loads(args.installation_config.read_text(encoding='utf-8-sig'))
assert config['expected_build_sha256'] == args.expected_build
parent = Path(config['authority_store_parent'])
assert parent.is_absolute()
control = args.control_dir.resolve()
assert control.is_dir()
lock = SdkAccessLock(parent / 'backend_authority.sqlite')
try:
    lock.acquire(time.monotonic() + 90)
    (control / 'ready.json').write_text(json.dumps({'status': 'HELD', 'max_hold_seconds': 330}))
    deadline = time.monotonic() + 330
    while not (control / 'stop.request').exists() and time.monotonic() < deadline:
        time.sleep(0.1)
finally:
    lock.release()
    (control / 'released.json').write_text(json.dumps({'status': 'RELEASED'}))
