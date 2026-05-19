"""
Code Review Orchestrator - Coordinates 4 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .security import security_agent
from .performance import performance_agent
from .architecture import architecture_agent
from .test_coverage import test_coverage_agent
from .synthesis import synthesis_agent


async def run_code_review(document: str) -> dict:
    """
    Run complete code review analysis.

    Args:
        document: Source code or codebase summary

    Returns:
        Structured report dictionary with findings and recommendations
    """
    # 1. Run 4 agents in parallel
    agents = [security_agent, performance_agent, architecture_agent, test_coverage_agent]
    results = await run_parallel(agents, document)

    # 2. Build synthesis input from all results
    combined = "\n\n".join(f"=== {k.upper()} ==>\n{v}" for k, v in results.items())

    # 3. Run synthesis agent
    raw_synthesis = await synthesis_agent.run(combined)

    # 4. Parse JSON output
    try:
        report = json.loads(raw_synthesis)
    except json.JSONDecodeError:
        report = {"raw": raw_synthesis, "agents": results}

    return report
