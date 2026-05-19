"""
Synthesis Agent - UX review report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 4 UX review agents: Usability, Accessibility, Competitive, Metrics.
Produce a UX review report as JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "ux_score": <int 0-100>,
  "ship_recommendation": "<SHIP|SHIP_WITH_FIXES|DO_NOT_SHIP>",
  "summary": "<2-3 sentences>",
  "findings": [
    {
      "agent": "<usability|accessibility|competitive|metrics>",
      "title": "<title>",
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "detail": "<finding>",
      "action": "<fix>"
    }
  ],
  "accessibility_blockers": ["<blocker 1>"],
  "top_quick_wins": ["<win 1>", "<win 2>", "<win 3>"]
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
