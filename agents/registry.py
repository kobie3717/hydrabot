"""
Central registry for agent packs
Maps pack names to orchestrators
"""

from typing import Dict, List, Callable, Any
from .redteam.orchestrator import run_redteam


AGENT_PACKS: Dict[str, Dict[str, Any]] = {
    "redteam": {
        "name": "Red Team",
        "description": "Attacks your strategy from 5 adversarial angles: CFO, Market, Legal, Competitor, Execution",
        "run": run_redteam,
        "input": "Strategic document text (business plan, IPO filing, M&A memo, product strategy)",
        "output": "JSON report with risk score 0-100 and PROCEED/PROCEED_WITH_CAUTION/DO_NOT_PROCEED verdict",
    }
}


def list_packs() -> List[Dict[str, str]]:
    """
    List all available agent packs.

    Returns:
        List of pack metadata dictionaries
    """
    return [
        {
            "id": pack_id,
            "name": pack["name"],
            "description": pack["description"],
            "input": pack["input"],
            "output": pack["output"],
        }
        for pack_id, pack in AGENT_PACKS.items()
    ]


async def run_pack(pack_id: str, document: str) -> dict:
    """
    Run a specific agent pack on a document.

    Args:
        pack_id: ID of the agent pack (e.g., "redteam")
        document: Input document text

    Returns:
        Pack-specific output dictionary

    Raises:
        ValueError: If pack_id is not found
    """
    if pack_id not in AGENT_PACKS:
        available = list(AGENT_PACKS.keys())
        raise ValueError(f"Unknown agent pack: {pack_id}. Available: {available}")

    return await AGENT_PACKS[pack_id]["run"](document)
