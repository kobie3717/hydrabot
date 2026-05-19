"""
Documentation Review Orchestrator - Coordinates 4 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .accuracy import accuracy_agent
from .readability import readability_agent
from .examples import examples_agent
from .maintenance import maintenance_agent
from .synthesis import synthesis_agent


async def run_docs_review(document: str) -> dict:
    """
    Run complete documentation review analysis.

    Args:
        document: Technical documentation, API docs, or guides

    Returns:
        Structured documentation quality report with blocking issues
    """
    # 1. Run 4 agents in parallel
    agents = [accuracy_agent, readability_agent, examples_agent, maintenance_agent]
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
