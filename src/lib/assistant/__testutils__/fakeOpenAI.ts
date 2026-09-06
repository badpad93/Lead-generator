import type { ResponseStreamEvent } from "openai/resources/responses/responses";

/**
 * Scripted Responses API client. Each `create()` call yields the next
 * scripted round's events. Records every request so tests can assert
 * on store/stream/tools/parallel settings. Never touches the network.
 */
export type ScriptedRound = ResponseStreamEvent[];

function completed(id: string, input: number, output: number): ResponseStreamEvent {
  return {
    type: "response.completed",
    sequence_number: 99,
    response: { id, usage: { input_tokens: input, output_tokens: output, total_tokens: input + output, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } as never,
  } as ResponseStreamEvent;
}

export function textRound(text: string, id = "resp_text"): ScriptedRound {
  return [
    { type: "response.output_text.delta", delta: text, item_id: "msg_1", output_index: 0, content_index: 0, sequence_number: 1, logprobs: [] } as ResponseStreamEvent,
    completed(id, 100, 20),
  ];
}

export function toolRound(name: string, args: Record<string, unknown>, callId = "call_1", id = "resp_tool"): ScriptedRound {
  return [
    { type: "response.reasoning_summary_text.delta", delta: "SECRET REASONING", item_id: "rs_1", output_index: 0, sequence_number: 1, summary_index: 0 } as ResponseStreamEvent,
    { type: "response.output_item.done", output_index: 0, sequence_number: 2, item: { type: "function_call", id: "fc_1", call_id: callId, name, arguments: JSON.stringify(args), status: "completed" } } as ResponseStreamEvent,
    completed(id, 50, 10),
  ];
}

export function errorRound(): ScriptedRound {
  return [{ type: "error", code: "server_error", message: "boom", param: null, sequence_number: 1 } as ResponseStreamEvent];
}

export function createFakeOpenAI(rounds: ScriptedRound[]) {
  const requests: Array<Record<string, unknown>> = [];
  let i = 0;
  const client = {
    responses: {
      create: async (params: Record<string, unknown>, opts?: { signal?: AbortSignal }) => {
        requests.push(params);
        const events = rounds[i] ?? textRound("(no more script)");
        i += 1;
        async function* gen() {
          for (const ev of events) {
            if (opts?.signal?.aborted) return;
            yield ev;
          }
        }
        return gen();
      },
    },
  };
  return { client: client as never, requests };
}
