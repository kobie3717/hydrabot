"""
Synthesis Agent - Hiring recommendation report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 4 recruitment agents: TechScreener, CultureFit, Compensation, OfferStrategy.
Produce a structured hiring recommendation JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "recommendation": "<HIRE|MAYBE|PASS>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "summary": "<2-3 sentences>",
  "tech_fit": "<STRONG|PARTIAL|WEAK>",
  "culture_fit": "<POSITIVE|NEUTRAL|NEGATIVE>",
  "findings": [
    {
      "agent": "<tech_screener|culture_fit|compensation|offer_strategy>",
      "title": "<title>",
      "sentiment": "<POSITIVE|NEUTRAL|NEGATIVE>",
      "detail": "<finding>"
    }
  ],
  "interview_questions": ["<q1>", "<q2>", "<q3>"],
  "offer_range": "<range>",
  "close_probability": "<HIGH|MEDIUM|LOW>"
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
