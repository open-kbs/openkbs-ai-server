from diffusers import StableDiffusionXLControlNetInpaintPipeline, ControlNetModel
from common.utils import log, load_image
from common.stablediffusion import extract_params_sdxl
import torch
import time
import json
import os
import cv2
import numpy as np
from PIL import Image
import datetime

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def make_canny_condition(image):
    image = np.array(image)
    image = cv2.Canny(image, 100, 200)
    image = image[:, :, None]
    image = np.concatenate([image, image, image], axis=2)
    image = Image.fromarray(image)
    return image

# https://github.com/huggingface/diffusers/issues/4392
# https://huggingface.co/diffusers/stable-diffusion-xl-1.0-inpainting-0.1
def load():
    start_in_ram = time.time()
    controlnet = ControlNetModel.from_pretrained(
        "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16
    )
    pipe = StableDiffusionXLControlNetInpaintPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", controlnet=controlnet, torch_dtype=torch.float16
    )

    if os.environ.get("COMPILE_TORCH"):
        pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

    loaded_in_ram = round(time.time() - start_in_ram, 2) 
    start_in_vram = time.time()
    pipe.to('cuda')
    loaded_in_vram = round(time.time() - start_in_vram, 2)
    return {'pipe': pipe, 'loaded_in_ram': loaded_in_ram, 'loaded_in_vram': loaded_in_vram}

def call(payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipe):
    config_dict = extract_params_sdxl(payload)

    config_dict['generator'] = torch.Generator(device="cpu").manual_seed(1)

    log('Loading image')
    config_dict['image'] = load_image(payload['image']).resize((1024, 1024))

    log('Loading mask_image')
    config_dict['mask_image'] = load_image(payload['mask_image']).resize((1024, 1024))

    log('Loading control_image')
    config_dict['control_image'] = make_canny_condition(config_dict['image'])
    config_dict['eta'] = 1.0

    log('Images loaded')

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