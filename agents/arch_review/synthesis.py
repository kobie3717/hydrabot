"""
Synthesis Agent - Architecture review report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 5 architecture review agents: Scalability, SecurityArch, Cost, Integration, TechDebt.
Produce a structured architecture review JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "verdict": "<APPROVE|APPROVE_WITH_CONDITIONS|REJECT>",
  "risk_score": <int 0-100>,
  "summary": "<2-3 sentences>",
  "findings": [
    {
      "agent": "<scalability|security_arch|cost|integration|tech_debt>",
      "title": "<title>",
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "detail": "<finding>",
      "action": "<required change>"
    }
  ],
  "required_before_ship": ["<item 1>", "<item 2>"],
  "estimated_monthly_cost_risk": "<range>"
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
