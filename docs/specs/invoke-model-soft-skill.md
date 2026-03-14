# Spec: Invoke Model Soft Skill (Task-Based)

## Objective
Provide Stellabot soft agents with the ability to delegate specific task types (e.g., image generation, transcription) to specialized models (e.g., Gemini 3 Pro Image) without requiring a physical machine/gateway handoff, while enforcing strict cost and security guardrails.

## Approach: Task-Type Driven Invocation
Rather than an open `invoke_model(model)` function which poses exfiltration and cost risks, we will implement a controlled `invoke_model` tool in `CLOUD_TOOLS` where the agent requests a **task type**, not an open-ended model override.

### Tool Definition (`CLOUD_TOOLS`)
- **Name**: `invoke_model`
- **Description**: Delegate specialized tasks (like image generation, audio transcription) to purpose-built models.
- **Input Schema**:
  - `taskType` (enum: `'generate_image'`, `'transcribe_audio'`, etc.)
  - `payload` (object): Task-specific input data (e.g., `{ "prompt": "a sunset" }` for images, or `{ "audio_url": "..." }` for transcription). *Replaces a generic "prompt" field to accommodate different media and task requirements.*
  - `model` (optional string): Requested model ID (must be approved for the `taskType` by the server, otherwise falls back to task default)

## Server-Side Enforcement (`soft-agent-chat.ts`)
1. **Validation**: Server intercepts `invoke_model`. It checks `taskType` against an allowed registry.
2. **Model Resolution**: 
   - If `taskType === 'generate_image'`, the server maps this to the configured image model (e.g., `google/gemini-3.1-pro-image` or `openai/dall-e-3`).
   - If the agent requested a specific `model`, the server verifies it is allowlisted for that `taskType`.
3. **Execution**: The server executes the API call directly using the Org's credentials (from `agent_secrets` or `integration_credentials`).
4. **Cost Accounting**: The invocation cost is tracked by `taskType` and model via the existing `logger.apiCall` infrastructure to prevent budget abuse.
5. **Return**: The server wraps the output in standard formatting (e.g., returning a `ToolResultWithImage` block so the image is rendered directly in the chat UI).

## Phase 1 Implementation: Image Generation
- **Target Model**: Gemini 3 Pro Image (acting as the native `nano-banana-pro` equivalent).
- **Credentials**: Reuse the existing Google/Gemini API key resolution from the org/agent secrets architecture.
- **Input Payload**: `{ "prompt": "image description", "resolution": "1K" }`
- **Output**: Returns base64 image data mapped to the `ToolResultWithImage` interface already present in `soft-agent-chat.ts`.

## Security & Guardrails
- **No Arbitrary Execution**: Agents cannot pass random model strings to execute arbitrary prompts on expensive text models (e.g., Opus).
- **Cost Controls**: Enforced limits and usage logs per taskType/org.
- **Isolation**: Soft agents remain fully cloud-native; no physical machine proxying required.

## Next Steps
1. Add `invoke_model` to `CLOUD_TOOLS` with the updated payload schema.
2. Implement the `taskType` switch/handler within the tool execution loop in `soft-agent-chat.ts`.
3. Wire up the `generate_image` task to the Gemini API, routing credentials and returning the `ToolResultWithImage` payload.
