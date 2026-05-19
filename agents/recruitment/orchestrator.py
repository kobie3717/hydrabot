"""
Recruitment Orchestrator - Coordinates 4 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .tech_screener import tech_screener_agent
from .culture_fit import culture_fit_agent
from .compensation import compensation_agent
from .offer_strategy import offer_strategy_agent
from .synthesis import synthesis_agent


async def run_recruitment(document: str) -> dict:
    """
    Run complete recruitment analysis.

    Args:
        document: Candidate CV, portfolio, cover letter, or application

    Returns:
        Structured hiring recommendation with offer strategy
    """
    # 1. Run 4 agents in parallel
    agents = [tech_screener_agent, culture_fit_agent, compensation_agent, offer_strategy_agent]
    results = await run_parallel(agents, document)

    # 2. Build synthesis input from all results
    combined = "\n\n".join(f"=== {k.upper()} ===\n{v}" for k, v in results.items())

    # 3. Run synthesis agent
    raw_synthesis = await synthesis_agent.run(combined)

    # 4. Parse JSON output
    try:
        report = json.loads(raw_synthesis)
    except json.JSONDecodeError:
        report = {"raw": raw_synthesis, "agents": results}

    return report
