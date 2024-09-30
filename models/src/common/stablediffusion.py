from common.utils import extract_config

def extract_params_sdxl(payload):
    return extract_config(
        payload,
        [
            ("prompt", "p"),
            ("prompt_2", "p2"),
            ("negative_prompt", "np"),
            ("negative_prompt_2", "np2"),
        ],
        [
            ("height", "h"),
            ("width", "w"),
            ("num_inference_steps", "s"),
            ("noise_level", "nl"),
            ("denoising_start", "ds"),
            ("denoising_end", "de"),
            ("guidance_scale", "g"),
            ("eta", "eta"),
            ("crops_coords_top_left", "cctl"),
            ("target_size", "ts"),
            ("original_size", "os"),
            ("negative_original_size", "nos"),
            ("negative_crops_coords_top_left", "ncctl"),
            ("negative_target_size", "nts"),
            ("strength", "strength")
        ],
    )