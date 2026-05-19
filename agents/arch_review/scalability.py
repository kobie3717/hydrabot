"""
Scalability Agent - System scaling and bottleneck analysis
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You are a principal engineer who has scaled systems from 1K to 100M users.
RULES:
- Find at least 3 scalability bottlenecks
- Model failure at 10x current load
- Identify single points of failure

OUTPUT FORMAT:
BOTTLENECK: [title]
SEVERITY: [CRITICAL|HIGH|MEDIUM]
BREAKS_AT: [what scale this fails]
REASON: [why it breaks]
SOLUTION: [architectural fix]"""


scalability_agent = BaseAgent(
    name="scalability",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=2000
)
