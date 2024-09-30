from diffusers import StableDiffusionXLPipeline, StableDiffusionLatentUpscalePipeline
import torch
import time
import json
import os
from common.stablediffusion import extract_params_sdxl
from common.utils import log

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def load():
    start_in_ram = time.time()
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True
    )
    upscaler = StableDiffusionLatentUpscalePipeline.from_pretrained("stabilityai/sd-x2-latent-upscaler", torch_dtype=torch.float16)
    loaded_in_ram = round(time.time() - start_in_ram, 2) 
    start_in_vram = time.time()        
    pipe.to('cuda')
    upscaler.to('cuda')
    loaded_in_vram = round(time.time() - start_in_vram, 2)
    return {'pipe': pipe, 'upscaler': upscaler, 'loaded_in_ram': loaded_in_ram, 'loaded_in_vram': loaded_in_vram}

def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe):
    config_dict = extract_params_sdxl(payload)

    config_dict['generator'] = torch.Generator("cuda")
    seed = payload.get('seed')
    if seed is not None:
        config_dict['generator'].manual_seed(int(payload['seed']))

    start_inference = time.time()
    
    pipe['pipe'].set_use_memory_efficient_attention_xformers(True)
    low_res_latents = pipe['pipe'](**config_dict).images

    # config_dict['num_inference_steps'] = config_dict.get('num_inference_steps', 30)
    config_dict['guidance_scale'] = config_dict.get('guidance_scale', 0)
    config_dict['image'] = low_res_latents

    pipe['upscaler'].set_use_memory_efficient_attention_xformers(True)
    upscaled_image = pipe['upscaler'](**config_dict).images[0]

    upscaled_filepath = f"tmp_images/{requestUUID}_x2.png"
    upscaled_image.save(upscaled_filepath)

    time_inference = round(time.time() - start_inference, 2)
    response = json.dumps({
        'type': 'CALL_PIPE_RESPONSE',
        'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES,
        'pipeId': pipeId,
        'uuid': requestUUID,
        'timeToInference': time_inference,
        'filepath': upscaled_filepath
    })
    return response