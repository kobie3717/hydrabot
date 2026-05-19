"""
Incident Response Orchestrator - Coordinates 5 agents + synthesis
"""

import json
from typing import Dict
from ..runner import run_parallel
from .log_analyzer import log_analyzer_agent
from .root_cause import root_cause_agent
from .mitigation import mitigation_agent
from .comms import comms_agent
from .postmortem import postmortem_agent
from .synthesis import synthesis_agent


async def run_incident(document: str) -> dict:
    """
    Run complete incident response analysis.

    Args:
        document: Incident data (logs, metrics, timeline)

    Returns:
        Structured incident report with root cause, actions, and communications
    """
    # 1. Run 5 agents in parallel
    agents = [log_analyzer_agent, root_cause_agent, mitigation_agent, comms_agent, postmortem_agent]
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
