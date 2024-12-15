from diffusers import StableDiffusionUpscalePipeline
# from diffusers.utils import load_image
from common.utils import log, load_image
from PIL import Image
import torch
import time
import json
import os
from common.stablediffusion import extract_params_sdxl
from common.utils import log
from split_image import split
import random
import math

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def load():
    start_in_ram = time.time()
    pipe = StableDiffusionUpscalePipeline.from_pretrained(
        "stabilityai/stable-diffusion-x4-upscaler", torch_dtype=torch.float16, variant="fp16", use_safetensors=True
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
    config_dict['image'] = load_image(payload['image']).convert("RGB")

    nonsharded = int(payload['nonsharded']) if 'nonsharded' in payload else None
    rows = int(payload['rows']) if 'rows' in payload else None
    cols = int(payload['cols']) if 'cols' in payload else None
    tile_index = int(payload['tile_index']) if 'tile_index' in payload else None

    start_inference = time.time()
    if nonsharded is None and (config_dict['image'].size[1] > 512 or rows is not None):
        if rows is not None and cols is not None and tile_index is not None:
            # Process only the specific tile
            tile = split_image(config_dict['image'], rows, cols, True, specific_tile_index=tile_index)
            config_dict['image'] = tile
            image = pipe['pipe'](**config_dict).images[0]
        else:
            # Process all tiles
            tiles = split_image(config_dict['image'], 2, 2, True)
            upscaled_tiles = []
            for tile in tiles:
                config_dict['image'] = tile
                upscaled_tile = pipe['pipe'](**config_dict).images[0]
                upscaled_tiles.append(upscaled_tile)
            image = merge_tiles(upscaled_tiles, 2, 2)
    else:
        image = pipe['pipe'](**config_dict).images[0]

    filepath = f"tmp_images/{requestUUID}-x4.png"
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

def distribute_tiles(num_gpus):
    # Calculate the square root of the number of GPUs
    sqrt_gpus = math.sqrt(num_gpus)

    # If the square root is an integer, distribute the tiles in a square grid
    if sqrt_gpus.is_integer():
        return int(sqrt_gpus), int(sqrt_gpus)
    else:
        # If the square root is not an integer, find the closest pair of factors
        factor1 = int(sqrt_gpus)
        while num_gpus % factor1 != 0:
            factor1 -= 1
        factor2 = num_gpus // factor1
        return factor1, factor2

def split_image(im, rows, cols, should_square, specific_tile_index=None):
    im_width, im_height = im.size
    row_width = int(im_width / cols)
    row_height = int(im_height / rows)
    name = "image"
    ext = ".png"
    name = os.path.basename(name)
    images = []
    if should_square:
        min_dimension = min(im_width, im_height)
        max_dimension = max(im_width, im_height)
        bg_color = split.determine_bg_color(im)
        im_r = Image.new("RGBA" if ext == "png" else "RGB",
                         (max_dimension, max_dimension), bg_color)
        offset = int((max_dimension - min_dimension) / 2)
        if im_width > im_height:
            im_r.paste(im, (0, offset))
        else:
            im_r.paste(im, (offset, 0))
        im = im_r
        row_width = int(max_dimension / cols)
        row_height = int(max_dimension / rows)

    if specific_tile_index is not None:
        # Calculate the position of the specific tile
        tile_row = specific_tile_index // cols
        tile_col = specific_tile_index % cols
        box = (tile_col * row_width, tile_row * row_height,
               (tile_col + 1) * row_width, (tile_row + 1) * row_height)
        tile = im.crop(box)
        return tile

    # If specific_tile_index is not provided, process all tiles
    for i in range(rows):
        for j in range(cols):
            box = (j * row_width, i * row_height,
                   (j + 1) * row_width, (i + 1) * row_height)
            tile = im.crop(box)
            images.append(tile)
    return images


def merge_tiles(tiles, rows, cols):
    tile_width = tiles[0].width
    tile_height = tiles[0].height
    total_width = tile_width * cols
    total_height = tile_height * rows
    merged_image = Image.new("RGB", (total_width, total_height))
    for i in range(rows):
        for j in range(cols):
            tile = tiles[i * cols + j]
            merged_image.paste(tile, (j * tile_width, i * tile_height))
    return merged_image