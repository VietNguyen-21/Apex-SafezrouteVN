from dataclasses import dataclass
import hashlib
import hmac
import json
from pathlib import Path
import re

from backend.api.errors import ApiError


@dataclass(frozen=True)
class Actor:
    actor_id: str
    role: str


class AuthStore:
    def __init__(self, path: Path):
        self.path = path

    def records(self):
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            rows = value["tokens"]
            if value.get("schema_version") != "saferoute-m3-auth/1" or not isinstance(rows, list) or not rows:
                raise ValueError("Invalid token configuration")
            seen = set()
            for row in rows:
                if (not re.fullmatch(r"[a-f0-9]{64}", row["token_sha256"])
                        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}", row["actor_id"])
                        or row["role"] not in ("dispatcher", "viewer") or row["token_sha256"] in seen):
                    raise ValueError("Invalid token record")
                seen.add(row["token_sha256"])
            return rows
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ApiError(503, "AUTH_NOT_CONFIGURED", "authentication", "Server authentication is unavailable") from error

    def authenticate(self, token: str):
        if not 20 <= len(token) <= 256:
            raise ApiError(401, "UNAUTHORIZED", "authentication", "Valid bearer token required")
        digest = hashlib.sha256(token.encode()).hexdigest()
        for row in self.records():
            if hmac.compare_digest(digest, row["token_sha256"]):
                return Actor(row["actor_id"], row["role"])
        raise ApiError(401, "UNAUTHORIZED", "authentication", "Valid bearer token required")
