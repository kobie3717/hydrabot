"""
Synthesis Agent - Launch readiness report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 5 product launch agents: Requirements, Feasibility, UXResearch, GTM, Risk.
Produce a launch readiness report as JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "launch_readiness": "<READY|CONDITIONALLY_READY|NOT_READY>",
  "confidence": <int 0-100>,
  "summary": "<2-3 sentences>",
  "critical_gaps": ["<gap 1>", "<gap 2>"],
  "findings": [
    {
      "agent": "<requirements|feasibility|ux_research|gtm|risk>",
      "title": "<title>",
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "detail": "<finding>",
      "action": "<what to fix>"
    }
  ],
  "launch_blockers": ["<blocker 1>", "<blocker 2>"],
  "recommended_timeline_adjustment": "<honest estimate>"
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
