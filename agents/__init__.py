"""
HydraBot Agents Library
Multi-agent orchestration using Anthropic Claude SDK
"""

from .registry import list_packs, run_pack, AGENT_PACKS
from .base import BaseAgent
from .runner import run_parallel, run_sequential

__all__ = [
    "list_packs",
    "run_pack",
    "AGENT_PACKS",
    "BaseAgent",
    "run_parallel",
    "run_sequential",
]
