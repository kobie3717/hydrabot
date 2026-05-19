"""
Red Team Agent Pack
Adversarial analysis from 5 perspectives: CFO, Market, Legal, Competitor, Execution
"""

from .orchestrator import run_redteam
from .cfo import cfo_agent
from .market import market_agent
from .legal import legal_agent
from .competitor import competitor_agent
from .execution import execution_agent
from .synthesis import synthesis_agent

__all__ = [
    "run_redteam",
    "cfo_agent",
    "market_agent",
    "legal_agent",
    "competitor_agent",
    "execution_agent",
    "synthesis_agent",
]
