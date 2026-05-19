"""
Product Launch Orchestrator - Coordinates 5 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .requirements import requirements_agent
from .feasibility import feasibility_agent
from .ux_research import ux_research_agent
from .gtm import gtm_agent
from .risk import risk_agent
from .synthesis import synthesis_agent


async def run_product_launch(document: str) -> dict:
    """
    Run complete product launch readiness analysis.

    Args:
        document: Product plan, PRD, or launch brief

    Returns:
        Structured launch readiness report with blockers and timeline
    """
    # 1. Run 5 agents in parallel
    agents = [requirements_agent, feasibility_agent, ux_research_agent, gtm_agent, risk_agent]
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
