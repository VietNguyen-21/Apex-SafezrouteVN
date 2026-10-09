from typing import Annotated
import sqlite3

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.services.auth import Actor
from .errors import ApiError

bearer = HTTPBearer(auto_error=False, scheme_name="ServerBearer")


def current_actor(request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "UNAUTHORIZED", "authentication", "Bearer token required")
    actor = request.app.state.auth.authenticate(credentials.credentials)
    request.state.actor_id = actor.actor_id
    return actor


def dispatcher(actor: Annotated[Actor, Depends(current_actor)]):
    if actor.role != "dispatcher":
        raise ApiError(403, "FORBIDDEN", "role", "Dispatcher role required")
    return actor


def session_owner(session_id: str, request: Request, actor: Annotated[Actor, Depends(current_actor)]):
    try:
        owner = request.app.state.sessions.owner(session_id)
    except (sqlite3.Error, OSError) as error:
        raise ApiError(503, "METADATA_UNAVAILABLE", "session", "Session metadata is unavailable") from error
    if owner is None:
        raise ApiError(404, "SESSION_NOT_FOUND", "session_id", "Session not found")
    if owner != actor.actor_id:
        raise ApiError(403, "FORBIDDEN", "session_id", "Session access denied")
    return actor
