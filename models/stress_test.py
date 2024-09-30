import torch
from torch.nn.functional import cosine_similarity
import time

database_vectors = torch.randn(200000, 1800)
query_vector = torch.randn(1800)

if torch.cuda.is_available():
    database_vectors = database_vectors.to('cuda')
    query_vector = query_vector.to('cuda')

database_vectors = torch.nn.functional.normalize(database_vectors, p=2, dim=1)
query_vector = torch.nn.functional.normalize(query_vector, p=2, dim=0)
print(f"Loaded")
start_time = time.time()

cosine_similarities = cosine_similarity(query_vector.unsqueeze(0), database_vectors)

_, top_indices = torch.topk(cosine_similarities, k=5)  # Взимаме топ 5 най-подобни

end_time = time.time()

elapsed_time = end_time - start_time

top_indices = top_indices.to('cpu')

# print(f"Top indices: {top_indices}")
# print(f"Elapsed time: {elapsed_time:.6f} seconds")