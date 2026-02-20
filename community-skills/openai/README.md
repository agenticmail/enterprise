# OpenAI

Integrate with OpenAI to chat, create, list and more.

## Tools

- **Chat Completion** (`openai_chat_completion`) — Create a chat completion using OpenAI models. Send a list of messages and receive an AI-generated response.
- **Create Embedding** (`openai_create_embedding`) — Generate vector embeddings for input text using OpenAI embedding models. Useful for semantic search and similarity.
- **List Models** (`openai_list_models`) — List all models available to the authenticated OpenAI account. Returns model IDs and ownership info.
- **Create Image** (`openai_create_image`) — Generate images using DALL-E. Provide a text prompt and optionally specify size and quality.
- **Moderate** (`openai_moderate`) — Check text for policy violations using the OpenAI Moderation API. Returns category flags and scores.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | openai authentication |

## Category

platform · Risk: medium
