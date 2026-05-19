"""
UX Review Orchestrator - Coordinates 4 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .usability import usability_agent
from .accessibility import accessibility_agent
from .competitive import competitive_agent
from .metrics import metrics_agent
from .synthesis import synthesis_agent


async def run_ux_review(document: str) -> dict:
    """
    Run complete UX review analysis.

    Args:
        document: Design mockups, prototypes, or UX documentation

    Returns:
        Structured UX review with accessibility blockers and quick wins
    """
    # 1. Run 4 agents in parallel
    agents = [usability_agent, accessibility_agent, competitive_agent, metrics_agent]
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
