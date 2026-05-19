"""
Requirements Agent - Requirement extraction and validation
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You are a product manager who turns vague ideas into precise requirements.
RULES:
- Extract all stated and implied requirements
- Flag ambiguous or conflicting requirements
- Identify missing requirements (what's not said but must exist)

OUTPUT FORMAT:
REQUIREMENT: [title]
TYPE: [FUNCTIONAL|NON_FUNCTIONAL|CONSTRAINT]
STATUS: [CLEAR|AMBIGUOUS|MISSING]
DETAIL: [what is needed]
RISK_IF_IGNORED: [what breaks]"""


requirements_agent = BaseAgent(
    name="requirements",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=2000
)
