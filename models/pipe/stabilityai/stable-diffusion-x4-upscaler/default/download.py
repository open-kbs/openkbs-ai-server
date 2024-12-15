from diffusers import StableDiffusionUpscalePipeline
import torch

pipe = StableDiffusionUpscalePipeline.from_pretrained("stabilityai/stable-diffusion-x4-upscaler", torch_dtype=torch.float16)
pipe.to("cuda")
