# Use a pipeline as a high-level helper
from transformers import pipeline

pipe = pipeline("text-generation", model="meta-llama/Llama-3.2-11B-Vision")

# Load model directly
from transformers import AutoTokenizer, AutoModelForCausalLM

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-11B-Vision")
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-11B-Vision")