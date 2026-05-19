"""
Base agent class using Anthropic SDK
"""

import os
from typing import Optional
import anthropic


class BaseAgent:
    """Base class for all agents using Anthropic Claude"""

    def __init__(
        self,
        name: str,
        system_prompt: str,
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 2000
    ):
        self.name = name
        self.system_prompt = system_prompt
        self.model = model
        self.max_tokens = max_tokens
        self.client = anthropic.AsyncAnthropic(
            api_key=os.environ.get("ANTHROPIC_API_KEY")
        )

    async def run(self, document: str) -> str:
        """
        Run the agent on the given document.

        Args:
            document: Input document text

        Returns:
            Agent response as string
        """
        message = await self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=self.system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": document
                }
            ]
        )

        # Extract text from response
        return message.content[0].text
