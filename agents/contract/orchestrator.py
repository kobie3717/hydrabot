"""
Contract Review Orchestrator - Coordinates 4 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .legal_risk import legal_risk_agent
from .financial_terms import financial_terms_agent
from .compliance import compliance_agent
from .negotiation import negotiation_agent
from .synthesis import synthesis_agent


async def run_contract(document: str) -> dict:
    """
    Run complete contract review analysis.

    Args:
        document: Contract text or summary

    Returns:
        Structured contract review with risks and negotiation strategy
    """
    # 1. Run 4 agents in parallel
    agents = [legal_risk_agent, financial_terms_agent, compliance_agent, negotiation_agent]
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
