import os
import json
import datetime
import io
import requests
from PIL import Image
from typing import Callable, Union
import PIL.Image
import PIL.ImageOps

# https://huggingface.co/docs/transformers/internal/generation_utils

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def load_image(
    image: Union[str, PIL.Image.Image], convert_method: Callable[[PIL.Image.Image], PIL.Image.Image] = None
) -> PIL.Image.Image:
    if isinstance(image, str):
        if image.startswith("http://") or image.startswith("https://"):
            r = requests.get(image, stream=True)
            image = Image.open(io.BytesIO(r.content))
        elif os.path.isfile(image):
            image = PIL.Image.open(image)
        else:
            raise ValueError(
                f"Incorrect path or URL. URLs must start with `http://` or `https://`, and {image} is not a valid path."
            )
    elif isinstance(image, PIL.Image.Image):
        image = image
    else:
        raise ValueError(
            "Incorrect format used for the image. Should be a URL linking to an image, a local path, or a PIL image."
        )

    image = PIL.ImageOps.exif_transpose(image)

    if convert_method is not None:
        image = convert_method(image)
    else:
        image = image.convert("RGB")

    return image

def log(msg):
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open('/tmp/openkbs-server.log', 'a') as f:
        f.write(f'\n\n{timestamp}: device{CUDA_VISIBLE_DEVICES}: {msg}')

def is_json(data):
    try:
        _ = json.loads(data)
    except ValueError as e:
        return False
    return True


class JSONStreamer:
    def __init__(self, connection=None, send_function=None, request_uuid=None, tokenizer=None, **decode_kwargs):
        self._tokenizer = tokenizer
        self._count = 0
        self._send_function = send_function
        self._connection = connection
        self._request_uuid = request_uuid
        self.skip_prompt = True
        self.next_tokens_are_prompt = True
        self.token_cache = []
        self.decode_kwargs = decode_kwargs
        self.print_len = 0

    @property
    def tokenizer(self):
        return self._tokenizer

    @tokenizer.setter
    def tokenizer(self, tokenizer):
        self._tokenizer = tokenizer

    @property
    def send_function(self):
        return self._send_function

    @send_function.setter
    def send_function(self, send_function):
        self._send_function = send_function

    @property
    def connection(self):
        return self._connection

    @connection.setter
    def connection(self, connection):
        self._connection = connection

#     def put(self, value):
#         self._count += 1  # Increment the count at the beginning
#
#         if len(value.shape) > 1 and value.shape[0] > 1:
#             raise ValueError("TextStreamer only supports batch size 1")
#         elif len(value.shape) > 1:
#             value = value[0]
#
#         if self.skip_prompt and self.next_tokens_are_prompt:
#             self.next_tokens_are_prompt = False
#             return
#
#         self.token_cache.extend(value.tolist())
#         text = self.tokenizer.decode(self.token_cache, **self.decode_kwargs)
#
#         if text.endswith("\n"):
#             printable_text = text[self.print_len:]
#             self.token_cache = []
#             self.print_len = 0
#         elif len(text) > 0 and self._is_chinese_char(ord(text[-1])):
#             printable_text = text[self.print_len:]
#             self.print_len += len(printable_text)
#         else:
#             printable_text = text[self.print_len:text.rfind(" ") + 1]
#             self.print_len += len(printable_text)
#
#         if printable_text:
#             response = json.dumps({"id": self._count, "content": printable_text, "type": "STREAM", "uuid": self._request_uuid})
#             self._send_function(self._connection, response)
#         # Otherwise, prints until the last space char (simple heuristic to avoid printing incomplete words,
#         # which may change with the subsequent token -- there are probably smarter ways to do this!)
#         else:
#             printable_text = text[self.print_len : text.rfind(" ") + 1]
#             self.print_len += len(printable_text)
#
#         response = json.dumps({"id": self._count, "content": printable_text, "type": "STREAM", "uuid": self._request_uuid})
#         self._send_function(self._connection, response)

#     def end(self):
#         response = json.dumps({"done": self._count, "type": "STREAM", "uuid": self._request_uuid})
#         self._send_function(self._connection, response)

    def put(self, value):
        if len(value.shape) > 1 and value.shape[0] > 1:
            raise ValueError("TextStreamer only supports batch size 1")
        elif len(value.shape) > 1:
            value = value[0]

        if self.skip_prompt and self.next_tokens_are_prompt:
            self.next_tokens_are_prompt = False
            return

        self.token_cache.extend(value.tolist())
        text = self.tokenizer.decode(self.token_cache, **self.decode_kwargs)

        if text.endswith("\n"):
            printable_text = text[self.print_len:]
            self.token_cache = []
            self.print_len = 0
        elif len(text) > 0 and self._is_chinese_char(ord(text[-1])):
            printable_text = text[self.print_len:]
            self.print_len += len(printable_text)
        else:
            printable_text = text[self.print_len:text.rfind(" ") + 1]
            self.print_len += len(printable_text)

        if printable_text:
            self._count += 1  # Increment the count here to ensure no skips
            response = json.dumps({"id": self._count, "content": printable_text, "type": "STREAM", "uuid": self._request_uuid})
            self._send_function(self._connection, response)

    def end(self):
        if self.token_cache:
            remaining_text = self.tokenizer.decode(self.token_cache, **self.decode_kwargs)
            remaining_text = remaining_text[self.print_len:]  # Only print unprinted text

            # Remove any special tokens like <|eot_id|>
            remaining_text = remaining_text.replace("<|eot_id|>", "").strip()

            if remaining_text:
                self._count += 1  # Increment count for the final message
                response = json.dumps({
                    "id": self._count,
                    "content": remaining_text,
                    "type": "STREAM",
                    "uuid": self._request_uuid
                })
                self._send_function(self._connection, response)
            self.token_cache = []
            self.print_len = 0

        response = json.dumps({"done": self._count, "type": "STREAM", "uuid": self._request_uuid})
        self._send_function(self._connection, response)

    def _is_chinese_char(self, cp):
        """Checks whether CP is the codepoint of a CJK character."""
        # This defines a "chinese character" as anything in the CJK Unicode block:
        #   https://en.wikipedia.org/wiki/CJK_Unified_Ideographs_(Unicode_block)
        #
        # Note that the CJK Unicode block is NOT all Japanese and Korean characters,
        # despite its name. The modern Korean Hangul alphabet is a different block,
        # as is Japanese Hiragana and Katakana. Those alphabets are used to write
        # space-separated words, so they are not treated specially and handled
        # like the all of the other languages.
        if (
            (cp >= 0x4E00 and cp <= 0x9FFF)
            or (cp >= 0x3400 and cp <= 0x4DBF)  #
            or (cp >= 0x20000 and cp <= 0x2A6DF)  #
            or (cp >= 0x2A700 and cp <= 0x2B73F)  #
            or (cp >= 0x2B740 and cp <= 0x2B81F)  #
            or (cp >= 0x2B820 and cp <= 0x2CEAF)  #
            or (cp >= 0xF900 and cp <= 0xFAFF)
            or (cp >= 0x2F800 and cp <= 0x2FA1F)  #
        ):  #
            return True

        return False

def convert_str_to_numeric(s):
    if s is None:
        return None
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return s

def extract_config(payload, stringParams, numericParams=None):
    config_dict = {}

    for key in stringParams:
        value = next((payload[k] for k in key if k in payload), None)
        if value is not None:
            config_dict[key[0]] = value    

    if numericParams:
        for key in numericParams:
            value = next((payload[k] for k in key if k in payload), None)
            if value is not None:
                if ',' in value:  # check if the value contains a comma
                    # split the string by the comma and convert each part to an integer
                    value = tuple(int(x) for x in value.split(','))
                else:
                    value = convert_str_to_numeric(value)
                config_dict[key[0]] = value

    return config_dict