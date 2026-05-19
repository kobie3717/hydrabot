"""
Architecture Review Orchestrator - Coordinates 5 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .scalability import scalability_agent
from .security_arch import security_arch_agent
from .cost import cost_agent
from .integration import integration_agent
from .tech_debt import tech_debt_agent
from .synthesis import synthesis_agent


async def run_arch_review(document: str) -> dict:
    """
    Run complete architecture review analysis.

    Args:
        document: Architecture documentation or system design

    Returns:
        Structured architecture review with verdict and cost estimates
    """
    # 1. Run 5 agents in parallel
    agents = [scalability_agent, security_arch_agent, cost_agent, integration_agent, tech_debt_agent]
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
