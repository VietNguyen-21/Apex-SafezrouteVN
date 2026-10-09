from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from backend.api.dependencies import current_actor, dispatcher
from backend.api.errors import envelope
from backend.models.http import HttpResponse, LoadScenarioRequest
from backend.services.auth import Actor

ScenarioId = Annotated[str, Path(pattern=r"^S[0-8]$", description="Pinned suite scenario S0–S8")]
router = APIRouter(prefix="/api/scenarios", tags=["Scenarios"], responses={401: {"model": HttpResponse}, 503: {"model": HttpResponse}})


@router.get("", response_model=HttpResponse, summary="Verified S0–S8 catalog")
def catalog(request: Request, actor: Annotated[Actor, Depends(current_actor)]):
    return envelope(request.state.request_id, request.app.state.catalog.public())


@router.get("/{scenario_id}", response_model=HttpResponse, summary="Scenario counts, epoch and pending source events")
def detail(scenario_id: ScenarioId, request: Request, actor: Annotated[Actor, Depends(current_actor)]):
    return envelope(request.state.request_id, request.app.state.catalog.detail(scenario_id))


@router.post("/{scenario_id}/load", response_model=HttpResponse, status_code=201,
             responses={403: {"model": HttpResponse}, 409: {"model": HttpResponse}},
             summary="Create an owned session through the public M2 SDK; request ID is durable")
async def load(scenario_id: ScenarioId, body: LoadScenarioRequest, request: Request,
               actor: Annotated[Actor, Depends(dispatcher)]):
    data = await request.app.state.session_service.load(scenario_id, body.request_id, actor)
    return envelope(request.state.request_id, data)
