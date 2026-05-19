"""
Central registry for agent packs
Maps pack names to orchestrators
"""

from typing import Dict, List, Callable, Any
from .redteam.orchestrator import run_redteam
from .code_review.orchestrator import run_code_review
from .incident.orchestrator import run_incident
from .contract.orchestrator import run_contract
from .arch_review.orchestrator import run_arch_review
from .recruitment.orchestrator import run_recruitment
from .product_launch.orchestrator import run_product_launch
from .content.orchestrator import run_content
from .ux_review.orchestrator import run_ux_review
from .docs_review.orchestrator import run_docs_review


AGENT_PACKS: Dict[str, Dict[str, Any]] = {
    "redteam": {
        "name": "Red Team",
        "description": "Attacks your strategy from 5 adversarial angles: CFO, Market, Legal, Competitor, Execution",
        "run": run_redteam,
        "input": "Strategic document text (business plan, IPO filing, M&A memo, product strategy)",
        "output": "JSON report with risk score 0-100 and PROCEED/PROCEED_WITH_CAUTION/DO_NOT_PROCEED verdict",
    },
    "code_review": {
        "name": "Code Review",
        "description": "Multi-angle code analysis: Security, Performance, Architecture, Test Coverage",
        "run": run_code_review,
        "input": "Source code or codebase summary",
        "output": "JSON report with findings, overall score 0-100, and block_merge flag",
    },
    "incident": {
        "name": "Incident Response",
        "description": "Real-time incident analysis: Log Analysis, Root Cause, Mitigation, Communications, Postmortem",
        "run": run_incident,
        "input": "Incident data (logs, metrics, timeline)",
        "output": "JSON report with severity, root cause, immediate actions, and customer communications",
    },
    "contract": {
        "name": "Contract Review",
        "description": "Multi-angle contract analysis: Legal Risk, Financial Terms, Compliance, Negotiation Strategy",
        "run": run_contract,
        "input": "Contract text or summary",
        "output": "JSON report with risk score 0-100, recommendation (SIGN|NEGOTIATE|DO_NOT_SIGN), and negotiation points",
    },
    "arch_review": {
        "name": "Architecture Review",
        "description": "System architecture analysis: Scalability, Security, Cost, Integration, Tech Debt",
        "run": run_arch_review,
        "input": "Architecture documentation or system design",
        "output": "JSON report with verdict (APPROVE|APPROVE_WITH_CONDITIONS|REJECT), risk score, and cost estimates",
    },
    "recruitment": {
        "name": "Recruitment",
        "description": "Candidate evaluation: Tech Screening, Culture Fit, Compensation Benchmarking, Offer Strategy",
        "run": run_recruitment,
        "input": "Candidate CV, portfolio, cover letter, or application",
        "output": "JSON report with recommendation (HIRE|MAYBE|PASS), interview questions, and offer range",
    },
    "product_launch": {
        "name": "Product Launch",
        "description": "Launch readiness analysis: Requirements, Feasibility, UX Research, GTM Strategy, Risk Assessment",
        "run": run_product_launch,
        "input": "Product plan, PRD, or launch brief",
        "output": "JSON report with launch readiness (READY|CONDITIONALLY_READY|NOT_READY) and timeline recommendations",
    },
    "content": {
        "name": "Content Strategy",
        "description": "Content analysis and optimization: Research, SEO, Tone/Voice, Distribution Strategy",
        "run": run_content,
        "input": "Content draft, brief, or article",
        "output": "JSON report with content score 0-100, publish readiness, and channel recommendations",
    },
    "ux_review": {
        "name": "UX Review",
        "description": "User experience analysis: Usability, Accessibility (WCAG), Competitive Benchmarking, Metrics",
        "run": run_ux_review,
        "input": "Design mockups, prototypes, or UX documentation",
        "output": "JSON report with UX score 0-100, ship recommendation, and accessibility blockers",
    },
    "docs_review": {
        "name": "Documentation Review",
        "description": "Documentation quality analysis: Accuracy, Readability, Examples Quality, Maintenance Risk",
        "run": run_docs_review,
        "input": "Technical documentation, API docs, or guides",
        "output": "JSON report with docs score 0-100, publish readiness, and blocking issues",
    },
}


def list_packs() -> List[Dict[str, str]]:
    """
    List all available agent packs.

    Returns:
        List of pack metadata dictionaries
    """
    return [
        {
            "id": pack_id,
            "name": pack["name"],
            "description": pack["description"],
            "input": pack["input"],
            "output": pack["output"],
        }
        for pack_id, pack in AGENT_PACKS.items()
    ]


async def run_pack(pack_id: str, document: str) -> dict:
    """
    Run a specific agent pack on a document.

    Args:
        pack_id: ID of the agent pack (e.g., "redteam")
        document: Input document text

    Returns:
        Pack-specific output dictionary

    Raises:
        ValueError: If pack_id is not found
    """
    if pack_id not in AGENT_PACKS:
        available = list(AGENT_PACKS.keys())
        raise ValueError(f"Unknown agent pack: {pack_id}. Available: {available}")

    return await AGENT_PACKS[pack_id]["run"](document)
