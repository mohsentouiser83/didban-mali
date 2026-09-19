from io import BytesIO
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, status
from fastapi.responses import Response, StreamingResponse

from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import DbSession
from app.simulation.schemas import (
    ComparativeMatrixRequest,
    ComparativeMatrixResponse,
    DecisionMemoExportRequest,
    PresetScenariosResponse,
    SavedScenarioCreateRequest,
    SavedScenarioItem,
    SavedScenariosListResponse,
    SimulationParametersRequest,
    SimulationResultResponse,
)
from app.simulation.service import (
    build_comparative_matrix,
    create_saved_scenario,
    delete_saved_scenario,
    generate_decision_memo_pdf,
    get_preset_scenarios,
    list_saved_scenarios,
    run_simulation,
)

router = APIRouter(prefix="/companies/{company_id}/simulation", tags=["simulation"])


@router.get("/presets", response_model=PresetScenariosResponse)
async def get_presets(
    company_id: UUID,
    access: CurrentCompanyAccess,
) -> PresetScenariosResponse:
    del company_id, access
    return get_preset_scenarios()


@router.post("/run", response_model=SimulationResultResponse)
async def post_run_simulation(
    company_id: UUID,
    params: SimulationParametersRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> SimulationResultResponse:
    del access
    return await run_simulation(session, company_id=company_id, params=params)


@router.get("/scenarios", response_model=SavedScenariosListResponse)
async def get_saved_scenarios(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> SavedScenariosListResponse:
    del access
    return await list_saved_scenarios(session, company_id=company_id)


@router.post("/scenarios", response_model=SavedScenarioItem, status_code=status.HTTP_201_CREATED)
async def post_save_scenario(
    company_id: UUID,
    req: SavedScenarioCreateRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> SavedScenarioItem:
    return await create_saved_scenario(
        session,
        company_id=company_id,
        req=req,
        user_id=getattr(access, "user_id", None),
    )


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    company_id: UUID,
    scenario_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> Response:
    del access
    await delete_saved_scenario(session, company_id=company_id, scenario_id=scenario_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/matrix", response_model=ComparativeMatrixResponse)
async def post_comparative_matrix(
    company_id: UUID,
    req: ComparativeMatrixRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> ComparativeMatrixResponse:
    del access
    return await build_comparative_matrix(session, company_id=company_id, req=req)


@router.post("/memo/pdf")
async def export_decision_memo_pdf(
    company_id: UUID,
    req: DecisionMemoExportRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> StreamingResponse:
    company_name = getattr(getattr(access, "company", None), "legal_name", "شرکت آزمایشی دیدبان")
    pdf_bytes = await generate_decision_memo_pdf(
        session,
        company_id=company_id,
        req=req,
        company_name=company_name,
    )

    filename = f"یادداشت_تصمیم_گیری_{company_name}.pdf"
    encoded_filename = quote(filename)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}",
            "Content-Length": str(len(pdf_bytes)),
        },
    )
