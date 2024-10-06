from transformers import AutoTokenizer
import transformers
import torch
import time
import json
import os

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

# https://replicate.com/meta/llama-2-70b/api#output-schema

def load():
    start_in_ram = time.time()
    model_id = "meta-llama/Llama-3.1-8B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    loaded_in_ram = round(time.time() - start_in_ram, 2)
    start_in_vram = time.time()
    pipe = transformers.pipeline(
        "text-generation",
        model=model_id,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    loaded_in_vram = round(time.time() - start_in_vram, 2)

    return {
        "pipe": pipe,
        "tokenizer": tokenizer,
        "loaded_in_ram": loaded_in_ram,
        "loaded_in_vram": loaded_in_vram,
    }


def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe, streamer=None):
    start_inference = time.time()
    max_new_tokens = int(payload.get("max_new_tokens", 500))
    min_new_tokens = int(payload.get("min_new_tokens", -3))
    temperature = float(payload.get("temperature", 0.01))
    top_k = int(payload.get("top_k", 50))
    top_p = float(payload.get("top_p", 0.9))
    stop_sequences = payload.get("stop_sequences", None)
    # seed = payload.get("seed", None)

    if stop_sequences:
        stop_sequences = [seq.strip() for seq in stop_sequences.split(',')]

    if streamer:
        streamer.tokenizer = pipe["tokenizer"]

    sequences = pipe["pipe"](
        payload["prompt"],
        do_sample=True,
        streamer=streamer,
        top_k=top_k,
        top_p=top_p,
        num_return_sequences=1,
        eos_token_id=pipe["tokenizer"].eos_token_id,
        max_new_tokens=max_new_tokens,
        min_new_tokens=min_new_tokens,
        temperature=temperature,
        stop_sequences=stop_sequences,
        # seed=seed,
    )

    if streamer:
        return sequences

    time_inference = round(time.time() - start_inference, 2)

    text = "".join(seq["generated_text"] for seq in sequences)

    # Convert the result into a JSON response
    response = json.dumps(
        {
            "type": "CALL_PIPE_RESPONSE",
            "CUDA_VISIBLE_DEVICES": CUDA_VISIBLE_DEVICES,
            "pipeId": pipeId,
            "uuid": requestUUID,
            "timeToInference": time_inference,
            "text": text,
        }
    )

    return response
