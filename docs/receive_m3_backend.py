"""Receive the sealed M3 0.8.0 backend on a new Windows machine.

This helper does not start the API, upload files, or print credentials. It
requires a complete received team tree and creates new private directories.
M1 dependencies require an explicitly selected online install or separate
wheelhouse; the sealed backend ZIP contains backend/runtime wheels only.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import zipfile


ZIP_NAME = "M3_backend_0.8.0_20261006_113056.zip"
ZIP_SHA256 = "59196340dd63980f25a3a9dafd3b838ca2d299621645f52f3406fd9e7c271f35"
MANIFEST_SHA256 = "6dab42a10f1fa631f1e1439304981cf4710f1b8de08c5c277b4bd9de5aa4539b"
BUILD_SHA256 = "80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41"
VN = timezone(timedelta(hours=7))
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class ReceiveError(Exception):
    """A failed prerequisite or receipt, with no automatic cleanup/reset."""


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def absolute_path(value: str, label: str, *, existing: bool = False) -> Path:
    path = Path(value)
    if not path.is_absolute():
        raise ReceiveError(f"{label} must be an absolute filesystem path")
    return path.resolve(strict=existing)


def paths_overlap(first: Path, second: Path) -> bool:
    return first.is_relative_to(second) or second.is_relative_to(first)


def validate_private_roots(team: Path, boot: Path, local: Path) -> None:
    if any(paths_overlap(a, b) for a, b in ((team, boot), (team, local), (boot, local))):
        raise ReceiveError("Team, Boot and Local must be disjoint; Boot/Local must be outside Team")
    for path in (boot, local):
        if path.exists() or path.is_symlink():
            raise ReceiveError("BootRoot and LocalRoot must be new, nonexistent directories")


def child_environment() -> dict[str, str]:
    environment = {
        key: value for key, value in os.environ.items()
        if key.upper() not in {"PYTHONPATH", "PYTHONHOME"}
    }
    environment.update(
        PYTHONDONTWRITEBYTECODE="1", PYTHONUTF8="1",
        PIP_DISABLE_PIP_VERSION_CHECK="1",
    )
    return environment


def inspect_command(argv: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess:
    """Read-only prerequisite commands run before any directory is created."""
    return subprocess.run(
        argv, cwd=cwd, env=child_environment(), capture_output=True,
        timeout=timeout, creationflags=CREATE_NO_WINDOW, check=False,
    )


def interpreter_guard(value: dict) -> None:
    expected = {"version": [3, 12], "system": "Windows", "bits": 64, "implementation": "CPython"}
    if value != expected:
        raise ReceiveError("Windows CPython 3.12 x64 is required")


def archive_name(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or ".." in path.parts
            or "\\" in name or ":" in name or name.endswith("/")):
        raise ReceiveError("Unsafe release archive path")
    return path


def verify_team_backend(team: Path, manifest: dict) -> int:
    if (manifest.get("schema_version") != "saferoute-m3-release/1"
            or manifest.get("app_version") != "0.8.0"
            or manifest.get("runtime_build_sha256") != BUILD_SHA256):
        raise ReceiveError("Release identity differs from the received M3 0.8.0 kit")
    checked = 0
    seen = set()
    for row in manifest["files"]:
        name = row["path"]
        relative = archive_name(name)
        if name in seen:
            raise ReceiveError("Duplicate release manifest file")
        seen.add(name)
        if not name.startswith("backend/"):
            continue
        target = team.joinpath(*relative.parts)
        if (not target.is_file() or target.is_symlink()
                or not target.resolve(strict=True).is_relative_to(team)
                or target.stat().st_size != row["bytes"] or digest(target) != row["sha256"]):
            raise ReceiveError("Receive matching backend files into Team before running this helper")
        checked += 1
    if checked == 0:
        raise ReceiveError("Release does not contain backend files")
    return checked


def extract_kit(archive: Path, kit: Path) -> None:
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ReceiveError("Duplicate release archive entry")
        for entry in entries:
            archive_name(entry.filename)
            if entry.is_dir() or stat.S_ISLNK(entry.external_attr >> 16):
                raise ReceiveError("Unsupported release archive entry")
        if source.testzip() is not None:
            raise ReceiveError("Release ZIP CRC failed")
        kit.mkdir(parents=False, exist_ok=False)
        for entry in entries:
            target = kit.joinpath(*archive_name(entry.filename).parts)
            if not target.resolve().is_relative_to(kit.resolve()):
                raise ReceiveError("Release extraction escaped its directory")
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(entry) as incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing)


def verify_extracted_kit(kit: Path) -> dict:
    if digest(kit / "release_manifest.json") != MANIFEST_SHA256:
        raise ReceiveError("Extracted release manifest hash differs")
    module_path = kit / "backend/scripts/release_tools.py"
    spec = importlib.util.spec_from_file_location("m3_received_release_tools", module_path)
    if spec is None or spec.loader is None:
        raise ReceiveError("Cannot load the received release verifier")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.verify_release(kit)


class Receiver:
    def __init__(self, team: Path, boot: Path, local: Path):
        self.team, self.boot, self.local = team, boot, local
        self.logs = boot / "receive-logs"
        self.logs.mkdir()
        self.report_path = boot / "receive.json"
        self.report = {
            "schema_version": "saferoute-m3-drive-receive/1",
            "status": "INCOMPLETE", "started_at": datetime.now(VN).isoformat(),
            "team_root": str(team), "boot_root": str(boot), "local_root": str(local),
            "release_zip_sha256": ZIP_SHA256, "release_manifest_sha256": MANIFEST_SHA256,
            "runtime_build_sha256": BUILD_SHA256,
            "launcher_started": False, "credentials_printed": False, "steps": [],
        }
        self.save()

    def save(self) -> None:
        self.report_path.write_text(json.dumps(self.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def run(self, label: str, argv: list[str | Path], *, timeout: int = 600) -> None:
        index = len(self.report["steps"]) + 1
        log = self.logs / f"{index:02d}_{label}.log"
        step = {"step": label, "status": "RUNNING", "log": str(log)}
        self.report["steps"].append(step)
        self.save()
        print(json.dumps({"step": label, "status": "RUNNING", "log": str(log)}), flush=True)
        process = None
        try:
            with log.open("xb") as output:
                process = subprocess.Popen(
                    [str(value) for value in argv], cwd=self.team, env=child_environment(),
                    stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                    creationflags=CREATE_NO_WINDOW,
                )
                try:
                    code = process.wait(timeout=timeout)
                except (subprocess.TimeoutExpired, KeyboardInterrupt):
                    # Stop only the exact process tree created for this step.
                    if process.poll() is None:
                        if os.name == "nt":
                            subprocess.run(
                                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                capture_output=True, timeout=30, creationflags=CREATE_NO_WINDOW,
                            )
                        else:
                            process.kill()
                        process.wait(timeout=30)
                    step["forced_stop"] = True
                    raise
            step.update(status="PASS" if code == 0 else "FAIL", exit_code=code)
            if code != 0:
                raise ReceiveError(f"Step {label} failed; retain its private log and receipt")
        except BaseException:
            step["status"] = "FAIL"
            if process is not None:
                step["exit_code"] = process.poll()
            raise
        finally:
            self.save()
        print(json.dumps({"step": label, "status": "PASS"}), flush=True)


def complete_g0_guard(report: dict, team: Path, boot: Path) -> None:
    if (report.get("status") != "G0_TECHNICAL_PASS"
            or report.get("step1_input_completeness") != "COMPLETE_VERIFIED"
            or report.get("build_sha256") != BUILD_SHA256
            or Path(report.get("snapshot_root", "")).resolve() != team
            or Path(report.get("team_root", "")).resolve() != team
            or Path(report.get("local_root", "")).resolve() != boot):
        raise ReceiveError("New complete source/environment G0 required; do not edit/reuse the old receipt")


def receive(args: argparse.Namespace) -> None:
    if os.name != "nt":
        raise ReceiveError("This receiver targets Windows only")
    team = absolute_path(args.team_root, "TeamRoot", existing=True)
    python = absolute_path(args.python312, "Python312", existing=True)
    boot = absolute_path(args.boot_root, "BootRoot")
    local = absolute_path(args.local_root, "LocalRoot")
    if not team.is_dir() or not python.is_file():
        raise ReceiveError("TeamRoot must be a directory and Python312 an executable file")
    validate_private_roots(team, boot, local)
    m1_wheels = absolute_path(args.m1_wheelhouse, "M1Wheelhouse", existing=True) if args.m1_wheelhouse else None
    if m1_wheels is not None and not m1_wheels.is_dir():
        raise ReceiveError("M1Wheelhouse must be a directory")
    if not (team / "geo_data/requirements.lock.txt").is_file():
        raise ReceiveError("The received Team is missing M1's exact dependency lock")
    node = shutil.which("node")
    if node is None:
        raise ReceiveError("Working Node.js on PATH is required for frozen JS checks")
    node_check = inspect_command([node, "--version"], team, 20)
    if node_check.returncode != 0:
        raise ReceiveError("Node.js prerequisite failed")
    python_check = inspect_command([
        str(python), "-I", "-B", "-c",
        "import json,sys,platform,struct; print(json.dumps({'version':list(sys.version_info[:2]),'system':platform.system(),'bits':struct.calcsize('P')*8,'implementation':platform.python_implementation()}))",
    ], team, 30)
    if python_check.returncode != 0:
        raise ReceiveError("Cannot inspect the selected Python interpreter")
    interpreter_guard(json.loads(python_check.stdout))
    archive = team / "releases" / ZIP_NAME
    if digest(archive) != ZIP_SHA256:
        raise ReceiveError("Backend ZIP hash differs from the accepted release")
    with zipfile.ZipFile(archive) as source:
        raw_manifest = source.read("release_manifest.json")
    if hashlib.sha256(raw_manifest).hexdigest() != MANIFEST_SHA256:
        raise ReceiveError("Received release manifest hash differs")
    backend_files = verify_team_backend(team, json.loads(raw_manifest))

    # Nothing above creates/updates Team, Boot, Local, installations or authority.
    boot.mkdir(parents=True, exist_ok=False)
    receiver = Receiver(team, boot, local)
    try:
        receiver.report.update(
            m1_dependency_mode="ONLINE_EXPLICIT" if args.install_m1_online else "EXTERNAL_WHEELHOUSE",
            team_backend_files_verified=backend_files,
        )
        (receiver.logs / "node_prerequisite.log").write_bytes(node_check.stdout + node_check.stderr)
        (receiver.logs / "python_prerequisite.log").write_bytes(python_check.stdout + python_check.stderr)
        original = team / "docs/M3_STEP1_PREFLIGHT_20261005.json"
        if original.is_file():
            preserved = boot / "received_M3_step1_preflight.json"
            shutil.copyfile(original, preserved)
            receiver.report["received_historical_preflight"] = {
                "path": str(preserved), "sha256": digest(preserved), "reused_for_install": False,
            }
        kit = boot / "received-kit"
        extract_kit(archive, kit)
        manifest = verify_extracted_kit(kit)
        verify_team_backend(team, manifest)
        receiver.report["kit_bytes_verified"] = True
        receiver.save()
        print(json.dumps({"step": "kit_and_team_bytes", "status": "PASS"}), flush=True)
        preflight = kit / "backend/scripts/preflight_m3.py"
        receiver.run("prepare_m2_source", [python, "-B", preflight, "--team-root", team, "--local-root", boot])
        receiver.run("create_runtime_venv", [python, "-I", "-B", "-m", "venv", boot / "venv"])
        runtime_python = boot / "venv/Scripts/python.exe"
        receiver.run("runtime_offline_dependencies", [
            runtime_python, "-B", "-m", "pip", "install", "--no-index", "--no-cache-dir",
            "--no-deps", "--require-hashes", "--find-links", kit / "wheelhouse/runtime",
            "-r", kit / "wheelhouse/runtime/requirements.hashed.txt",
        ])
        receiver.run("runtime_pip_check", [runtime_python, "-B", "-m", "pip", "check"])
        receiver.run("create_m1_venv", [python, "-I", "-B", "-m", "venv", boot / "m1-venv"])
        m1_python = boot / "m1-venv/Scripts/python.exe"
        m1_install: list[str | Path] = [
            m1_python, "-B", "-m", "pip", "install", "--no-cache-dir", "--no-deps",
            "--only-binary=:all:", "-r", team / "geo_data/requirements.lock.txt",
        ]
        if m1_wheels is not None:
            m1_install.extend(["--no-index", "--find-links", m1_wheels])
        receiver.run("m1_exact_dependencies", m1_install, timeout=1200)
        receiver.run("m1_pip_check", [m1_python, "-B", "-m", "pip", "check"])
        receiver.run("new_native_g0", [
            runtime_python, "-B", preflight, "--team-root", team, "--local-root", boot,
            "--native", "--m1-python", m1_python,
        ], timeout=7200)
        prepared = json.loads((boot / "installation.json").read_bytes())
        receipt_path = Path(prepared["latest_preflight_receipt"]).resolve(strict=True)
        if not receipt_path.is_relative_to((boot / "receipts").resolve(strict=True)):
            raise ReceiveError("New G0 receipt is not inside this Boot installation")
        g0 = json.loads(receipt_path.read_bytes())
        complete_g0_guard(g0, team, boot)
        receiver.report["new_source_preflight"] = {
            "path": str(receipt_path), "sha256": digest(receipt_path),
            "status": g0["status"], "step1_input_completeness": g0["step1_input_completeness"],
        }
        receiver.save()
        # Recheck the received team immediately before its separate installation.
        verify_team_backend(team, manifest)
        receiver.run("new_backend_offline_install", [
            python, "-B", kit / "backend/scripts/install_backend_offline.py",
            "--release-dir", kit, "--expected-manifest-sha256", MANIFEST_SHA256,
            "--project-root", team, "--local-root", local, "--base-python", python,
            "--preflight-receipt", receipt_path,
        ], timeout=1800)
        install_path = local / "receipts/install/install.json"
        install = json.loads(install_path.read_bytes())
        if (install.get("status") != "M3_OFFLINE_INSTALL_PASS"
                or Path(install.get("project_root", "")).resolve() != team
                or install.get("release_manifest_sha256") != MANIFEST_SHA256):
            raise ReceiveError("New backend installation receipt is not PASS for this received kit")
        receiver.report.update(status="M4_RECEIVE_INSTALL_PASS", install_receipt=str(install_path))
        print(json.dumps({
            "status": "M4_RECEIVE_INSTALL_PASS", "private_local_root": str(local),
            "receipt": str(receiver.report_path), "launcher_started": False,
            "credentials_printed": False,
        }), flush=True)
        print("Run the coordinated launcher from the runbook and wait for HTTP READY.", flush=True)
    except BaseException as error:
        receiver.report.update(status="M4_RECEIVE_INSTALL_FAIL", error_type=type(error).__name__)
        raise
    finally:
        receiver.report["finished_at"] = datetime.now(VN).isoformat()
        receiver.save()


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--team-root", required=True, help="Absolute received PROJECT directory")
    value.add_argument("--python312", required=True, help="Absolute Windows CPython 3.12 x64 python.exe")
    value.add_argument("--boot-root", required=True, help="NEW absolute private G0 directory outside Team")
    value.add_argument("--local-root", required=True, help="NEW absolute private backend directory outside Team/Boot")
    source = value.add_mutually_exclusive_group(required=True)
    source.add_argument("--install-m1-online", action="store_true", help="Explicitly allow M1 exact-lock pip install before offline use")
    source.add_argument("--m1-wheelhouse", help="Absolute separately received M1 wheelhouse for offline install")
    return value


def main() -> int:
    args = parser().parse_args()
    try:
        receive(args)
    except KeyboardInterrupt:
        print("M4_RECEIVE_INTERRUPTED. Keep new directories, logs and receipts; use new paths for a retry.", file=sys.stderr)
        return 130
    except Exception as error:
        # Child output stays in private logs; do not echo pip/SDK/installation output.
        message = str(error) if isinstance(error, ReceiveError) else type(error).__name__
        print(f"M4_RECEIVE_BLOCKED: {message}. Keep logs/receipts; use new paths for a retry.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
