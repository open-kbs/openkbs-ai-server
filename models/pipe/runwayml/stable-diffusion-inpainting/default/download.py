from diffusers import AutoPipelineForInpainting
from diffusers.utils import load_image
import torch

pipe = AutoPipelineForInpainting.from_pretrained("runwayml/stable-diffusion-inpainting", torch_dtype=torch.float16, variant="fp16")
pipe.to("cuda")