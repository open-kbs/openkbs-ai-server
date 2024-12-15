# from diffusers import StableDiffusionXLPipeline
import torch
import time
import json
import os
from common.stablediffusion import extract_params_sdxl
from diffusers import DiffusionPipeline, DDIMScheduler
from huggingface_hub import hf_hub_download

base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"
repo_name = "ByteDance/Hyper-SD"
ckpt_name = "Hyper-SDXL-2steps-lora.safetensors"

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def load():
    start_in_ram = time.time()

    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16")

    if os.environ.get("COMPILE_TORCH"):
        pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()

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

    config_dict.setdefault('guidance_scale', 0)
    config_dict.setdefault('num_inference_steps', 2)

    start_inference = time.time()
    # image=pipe(prompt=prompt, num_inference_steps=2, guidance_scale=0).images[0]
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
