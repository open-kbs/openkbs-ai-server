import torch
import time
import json
import os
from diffusers import (
    StableDiffusionXLPipeline,
    EulerAncestralDiscreteScheduler,
    AutoencoderKL
)

from common.stablediffusion import extract_params_sdxl

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]


def load():
    start_in_ram = time.time()

    # Load VAE component
    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix",
        torch_dtype=torch.float16
    )

    # Configure the pipeline
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "cagliostrolab/animagine-xl-3.0", 
        vae=vae,
        torch_dtype=torch.float16, 
        use_safetensors=True, 
    )


    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)

    loaded_in_ram = round(time.time() - start_in_ram, 2) 
    
    start_in_vram = time.time()        
    
    pipe.to('cuda')
    
    loaded_in_vram = round(time.time() - start_in_vram, 2)
    
    return {'pipe': pipe, 'loaded_in_ram': loaded_in_ram, 'loaded_in_vram': loaded_in_vram}

def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe):
    config_dict = extract_params_sdxl(payload)

    seed = payload.get('seed')
    if seed is not None:
        config_dict['generator'] = torch.Generator("cuda")
        config_dict['generator'].manual_seed(int(payload['seed']))

    start_inference = time.time()
    image = pipe['pipe'](**config_dict).images[0]
    filepath = f"tmp_images/{requestUUID}.png"
    image.save(filepath)
    time_inference = round(time.time() - start_inference, 2)
    response = json.dumps({
        'type': 'CALL_PIPE_RESPONSE',
        'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES,
        'pipeId': pipeId,
        'uuid': requestUUID,
        'timeToInference': time_inference,
        'filepath': filepath
    })
    return response
