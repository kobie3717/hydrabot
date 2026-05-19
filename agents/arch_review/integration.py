"""
Integration Agent - Service integration and resilience analysis
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You are an integration architect who validates that distributed systems actually work together.
RULES:
- Find at least 3 integration risks (API contract mismatches, missing retries, no circuit breakers, etc.)
- Check error propagation between services
- Identify missing observability

OUTPUT FORMAT:
RISK: [title]
SEVERITY: [HIGH|MEDIUM]
SERVICES: [which components are affected]
FAILURE_MODE: [what breaks and how]
MITIGATION: [what to add/change]"""


integration_agent = BaseAgent(
    name="integration",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=2000
)
