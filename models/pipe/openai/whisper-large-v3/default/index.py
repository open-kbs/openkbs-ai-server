import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import torch
import time
import json
import os
import requests
from urllib.parse import urlparse

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def download_file(url, requestUUID):
    # Parse the URL to get the path, then split the path to get the extension
    parsed_url = urlparse(url)
    _, file_extension = os.path.splitext(parsed_url.path)
    local_filename = f"tmp_files/{requestUUID}{file_extension}"  # Use the requestUUID with the correct extension

    # Ensure the tmp_files directory exists
    os.makedirs(os.path.dirname(local_filename), exist_ok=True)

    with requests.get(url, stream=True) as r:
        r.raise_for_status()  # This will raise an HTTPError if the HTTP request returned an unsuccessful status code
        with open(local_filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    return local_filename

def load():
    start_in_ram = time.time()

    device = "cuda" if torch.cuda.is_available() else "cpu"

    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model_id = "openai/whisper-large-v3"
    
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
    )

    loaded_in_ram = round(time.time() - start_in_ram, 2) 
    start_in_vram = time.time()        

    loaded_in_vram = round(time.time() - start_in_vram, 2)

    model.to(device)

    processor = AutoProcessor.from_pretrained(model_id)

    pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        max_new_tokens=128,
        chunk_length_s=30,
        batch_size=16,
        return_timestamps=True,
        torch_dtype=torch_dtype,
        device=device,
    )


    return {'pipe': pipe, 'loaded_in_ram': loaded_in_ram, 'loaded_in_vram': loaded_in_vram}

def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe):
    audio = payload.get('audio')

    local_audio_file = download_file(audio, requestUUID)

    start_inference = time.time()

    result = pipe["pipe"](local_audio_file)

    time_inference = round(time.time() - start_inference, 2)

    os.remove(local_audio_file)

    response = json.dumps({
        'type': 'CALL_PIPE_RESPONSE',
        'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES,
        'pipeId': pipeId,
        'uuid': requestUUID,
        'timeToInference': time_inference,
        'text': result["text"]
    })

    return response
