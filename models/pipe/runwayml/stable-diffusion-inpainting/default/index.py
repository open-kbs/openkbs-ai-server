from diffusers import AutoPipelineForInpainting
# from diffusers.utils import load_image
from common.utils import log, load_image
from common.stablediffusion import extract_params_sdxl
import torch
import time
import json
import os

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

# https://github.com/huggingface/diffusers/issues/4392
# https://huggingface.co/diffusers/stable-diffusion-xl-1.0-inpainting-0.1
def load():
    start_in_ram = time.time()
    pipe = AutoPipelineForInpainting.from_pretrained(
        "runwayml/stable-diffusion-inpainting", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)

    pipe.safety_checker = None
    pipe.requires_safety_checker = False

    if os.environ.get("COMPILE_TORCH"):
        pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

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

    config_dict['image'] = load_image(payload['image']).convert("RGB")
    config_dict['mask_image'] = load_image(payload['mask_image']).convert("RGB")

    start_inference = time.time()

    config_dict["height"] = config_dict.get("height", 1024)
    config_dict["width"] = config_dict.get("width", 1024)

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