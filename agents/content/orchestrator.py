"""
Content Strategy Orchestrator - Coordinates 4 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .researcher import researcher_agent
from .seo import seo_agent
from .tone import tone_agent
from .distribution import distribution_agent
from .synthesis import synthesis_agent


async def run_content(document: str) -> dict:
    """
    Run complete content strategy analysis.

    Args:
        document: Content draft, brief, or article

    Returns:
        Structured content strategy with optimization recommendations
    """
    # 1. Run 4 agents in parallel
    agents = [researcher_agent, seo_agent, tone_agent, distribution_agent]
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
