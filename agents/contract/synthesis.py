"""
Synthesis Agent - Contract review report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 4 contract review agents: LegalRisk, FinancialTerms, Compliance, Negotiation.
Produce a structured contract review JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "recommendation": "<SIGN|NEGOTIATE|DO_NOT_SIGN>",
  "risk_score": <int 0-100, 100=very risky>,
  "summary": "<2-3 sentences>",
  "critical_issues": ["<issue 1>", "<issue 2>"],
  "findings": [
    {
      "agent": "<legal_risk|financial_terms|compliance|negotiation>",
      "title": "<title>",
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "detail": "<finding>",
      "action": "<what to do>"
    }
  ],
  "top_negotiation_points": ["<point 1>", "<point 2>", "<point 3>"]
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
