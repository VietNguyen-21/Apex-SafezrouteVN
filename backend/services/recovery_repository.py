from datetime import datetime, timezone
import json
from uuid import uuid4
from backend.api.errors import ApiError
from .session_repository import SessionRepository


class RecoveryRepository(SessionRepository):
    def initialize(self):
        super().initialize()
        with self._db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS session_recovery (
                session_id TEXT PRIMARY KEY,status TEXT NOT NULL,diagnostic_code TEXT,
                validation_json TEXT,basis_json TEXT,checked_at TEXT,worker_id TEXT,
                installation_sha256 TEXT)""")
            db.execute("""CREATE TABLE IF NOT EXISTS recovery_audit (
                audit_id TEXT PRIMARY KEY,session_id TEXT,worker_id TEXT,command_id TEXT,
                operation TEXT,recorded_at TEXT,response_json TEXT,diagnostic_code TEXT)""")

    def ready_sessions(self):
        with self._db() as db:
            return [r[0] for r in db.execute("SELECT session_id FROM sessions WHERE status='READY' ORDER BY created_at,session_id")]

    def record(self, session_id, status, worker_id, installation, *, validation=None, basis=None, diagnostic=None):
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO session_recovery VALUES(?,?,?,?,?,?,?,?)", (session_id, status, diagnostic,
                json.dumps(validation, sort_keys=True) if validation is not None else None,
                json.dumps(basis, sort_keys=True) if basis is not None else None,
                datetime.now(timezone.utc).isoformat(), worker_id, installation))

    def audit(self, session_id, worker_id, command_id, operation, response=None, diagnostic=None):
        with self._db() as db:
            db.execute("INSERT INTO recovery_audit VALUES(?,?,?,?,?,?,?,?)", (uuid4().hex,session_id,worker_id,command_id,operation,
                datetime.now(timezone.utc).isoformat(), json.dumps(response, sort_keys=True, allow_nan=False) if response is not None else None, diagnostic))

    def assert_mutation_allowed(self, session_id, *, allow_validated_recovery=False):
        with self._db() as db:
            row = db.execute("SELECT status,diagnostic_code FROM session_recovery WHERE session_id=?", (session_id,)).fetchone()
        if row and row["status"] != "VERIFIED" and not (allow_validated_recovery and row["status"] == "VALIDATED"):
            raise ApiError(503, row["diagnostic_code"] or "SESSION_RECOVERING", "recovery", "Session writes blocked pending verified server recovery")

    def complete_verification(self, worker_id, installation):
        with self._db() as db:
            db.execute("UPDATE session_recovery SET status='VERIFIED' WHERE status='VALIDATED' AND worker_id=? AND installation_sha256=?", (worker_id, installation))

    def healthy(self):
        with self._db() as db:
            return db.execute("SELECT 1 FROM session_recovery WHERE status!='VERIFIED' LIMIT 1").fetchone() is None
