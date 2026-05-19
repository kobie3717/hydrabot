"""
Red Team Orchestrator - Coordinates 5 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .cfo import cfo_agent
from .market import market_agent
from .legal import legal_agent
from .competitor import competitor_agent
from .execution import execution_agent
from .synthesis import synthesis_agent


def format_for_synthesis(results: Dict[str, str]) -> str:
    """
    Format the outputs from 5 agents into a single document for synthesis.

    Args:
        results: Dictionary mapping agent names to their outputs

    Returns:
        Formatted string with all agent outputs
    """
    synthesis_input = []

    for agent_name in ["cfo", "market", "legal", "competitor", "execution"]:
        if agent_name in results:
            synthesis_input.append(f"=== {agent_name.upper()} AGENT ===")
            synthesis_input.append(results[agent_name])
            synthesis_input.append("")

    return "\n".join(synthesis_input)


async def run_redteam(document: str) -> dict:
    """
    Run the complete red team analysis on a strategic document.

    Args:
        document: Strategic document text (business plan, IPO filing, M&A memo, product strategy)

    Returns:
        Structured report dictionary with risk score and vulnerabilities
    """
    # 1. Run 5 agents in parallel
    agents = [cfo_agent, market_agent, legal_agent, competitor_agent, execution_agent]
    results = await run_parallel(agents, document)

    # 2. Build synthesis input from all results
    combined = format_for_synthesis(results)

    # 3. Run synthesis agent
    raw_synthesis = await synthesis_agent.run(combined)

    # 4. Parse JSON output
    try:
        report = json.loads(raw_synthesis)
    except json.JSONDecodeError as e:
        # If synthesis doesn't produce valid JSON, return error structure
        report = {
            "error": "Failed to parse synthesis output",
            "raw_output": raw_synthesis,
            "parse_error": str(e)
        }

    return report
