from diffusers import DiffusionPipeline
import torch
import time
import json
import os
from common.stablediffusion import extract_params_sdxl

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

# https://www.reddit.com/r/StableDiffusion/comments/13u25mo/whats_the_best_model_for_inpainting/
def load():
    start_in_ram = time.time()

    base = DiffusionPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True
    )

    refiner = DiffusionPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-refiner-1.0",
        text_encoder_2=base.text_encoder_2,
        vae=base.vae,
        torch_dtype=torch.float16,
        use_safetensors=True,
        variant="fp16",
    )

    if os.environ.get("COMPILE_TORCH"):
        base.unet = torch.compile(base.unet, mode="reduce-overhead", fullgraph=True)
        refiner.unet = torch.compile(refiner.unet, mode="reduce-overhead", fullgraph=True)

    loaded_in_ram = round(time.time() - start_in_ram, 2)

    start_in_vram = time.time()
    base.to("cuda")
    refiner.to("cuda")
    loaded_in_vram = round(time.time() - start_in_vram, 2)
    return {'base': base, 'refiner': refiner, 'loaded_in_ram': loaded_in_ram, 'loaded_in_vram': loaded_in_vram}

def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe):
    config_dict = extract_params_sdxl(payload)

    seed = payload.get('seed')
    if seed is not None:
        config_dict['generator'] = torch.Generator("cuda")
        config_dict['generator'].manual_seed(int(payload['seed']))

    start_inference = time.time()

    image = pipe['base'](
        **config_dict,
        denoising_end=float(payload.get('denoising_switch', 0.8)),
        output_type="latent",
    ).images

    config_dict.pop('height', None)
    config_dict.pop('width', None)

    image = pipe['refiner'](
        **config_dict,
        denoising_start=float(payload.get('denoising_switch', 0.8)),
        image=image,
    ).images[0]

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