"""
Agent execution runners - parallel and sequential
"""

import asyncio
from typing import List, Dict, Callable, Any
from .base import BaseAgent


async def run_parallel(agents: List[BaseAgent], document: str) -> Dict[str, str]:
    """
    Run multiple agents in parallel on the same document.

    Args:
        agents: List of BaseAgent instances
        document: Input document text

    Returns:
        Dictionary mapping agent names to their outputs
    """
    tasks = [agent.run(document) for agent in agents]
    results = await asyncio.gather(*tasks)

    return {agent.name: result for agent, result in zip(agents, results)}


async def run_sequential(steps: List[Callable]) -> Any:
    """
    Run a list of coroutines sequentially.

    Args:
        steps: List of coroutine functions or coroutines

    Returns:
        Result of the final step
    """
    result = None
    for step in steps:
        if asyncio.iscoroutine(step):
            result = await step
        else:
            result = await step()
    return result
