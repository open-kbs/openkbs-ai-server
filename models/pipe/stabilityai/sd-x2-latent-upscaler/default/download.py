from diffusers import StableDiffusionLatentUpscalePipeline, DiffusionPipeline
import torch

pipe = StableDiffusionLatentUpscalePipeline.from_pretrained("stabilityai/sd-x2-latent-upscaler", torch_dtype=torch.float16)
pipe.to("cuda")
