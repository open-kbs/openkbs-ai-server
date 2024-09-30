from diffusers import AutoPipelineForText2Image
import torch
import time
import json
import os
from common.stablediffusion import extract_params_sdxl
from common.utils import log

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def load():
    start_in_ram = time.time()
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    loaded_in_ram = round(time.time() - start_in_ram, 2) 
    start_in_vram = time.time()        
    pipe.to('cuda')
    loaded_in_vram = round(time.time() - start_in_vram, 2)
    return {'pipe': pipe, 'loaded_in_ram': loaded_in_ram, 'loaded_in_vram': loaded_in_vram}

def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe):
    config_dict = extract_params_sdxl(payload)


    if payload.get('seed') is not None:
        config_dict['generator'] = torch.Generator("cuda")
        config_dict['generator'].manual_seed(int(payload['seed']))

    start_inference = time.time()

    config_dict['guidance_scale'] = 0.0
    
    pipe['pipe'].set_use_memory_efficient_attention_xformers(True)
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