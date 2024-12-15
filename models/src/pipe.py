import torch
import socket
import os
import json
import queue
import importlib.util
from common.utils import JSONStreamer
import threading
from collections import OrderedDict
import datetime

load_pipe_queue = queue.Queue()

def is_json(data):
    try:
        _ = json.loads(data)
    except ValueError as e:
        return False
    return True

CUDA_VISIBLE_DEVICES = os.environ["CUDA_VISIBLE_DEVICES"]

def log(msg):
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open('/tmp/openkbs-server.log', 'a') as f:
        f.write(f'\n\n{timestamp}: device{CUDA_VISIBLE_DEVICES}: {msg}')

def create_and_bind_socket(server_address):
    # Create a Unix socket
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)

    # Make sure the socket does not already exist
    try:
        os.unlink(server_address)
    except OSError:
        if os.path.exists(server_address):
            raise

    # Bind the socket to the address and listen
    sock.bind(server_address)
    sock.listen(1)

    return sock

sock = create_and_bind_socket(f'./unix{CUDA_VISIBLE_DEVICES}.sock')
sock2 = create_and_bind_socket(f'./unix{CUDA_VISIBLE_DEVICES}.sock2')

print('Up and Running!', flush=True)

pipes = OrderedDict()

def call_pipe(pipeId, payload, requestUUID, streamer = None):
    log(pipeId)
    log(requestUUID)
    pipeId_parts = pipeId.split('--')
    module_path = os.path.join('models', 'pipe', *pipeId_parts, 'index.py')
    spec = importlib.util.spec_from_file_location("module.name", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    args = [payload, requestUUID, CUDA_VISIBLE_DEVICES, pipeId, pipes[pipeId]]
    log('executing module.call')
    if streamer:
        args.append(streamer)
    return module.call(*args)
    

def check_vram():
    torch.cuda.empty_cache()
    free_vram = torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated()
    return free_vram

def free_vram(required_vram, offset = 0.5):
    if not pipes:
        return True

    total_vram = torch.cuda.get_device_properties(0).total_memory
    required_vram_with_offset = required_vram + total_vram * offset

    log('requiredVRAM with offset ------------------------------------> ' + str(required_vram_with_offset))

    while True:
        if not pipes:
            break
        current_vram = check_vram()
        log('Current VRAM ------------------------------------> ' + str(current_vram))
        if current_vram >= required_vram_with_offset:
            break
        pipeId, pipe = pipes.popitem(last=False)  # remove the first inserted item
        del pipe  # delete the pipe
        torch.cuda.empty_cache()  # free up the memory
        log(f'Freed VRAM by DELETING --------------------------------> {pipeId}')

    return True


def load_pipe(pipeId, requiredVRAM):
    requiredVRAM = 10*10**12
    load_pipe_queue.put(pipeId)

    while not load_pipe_queue.empty():
        pipeId = load_pipe_queue.get()

        if pipeId in pipes:
            return pipes[pipeId]

        log('load ' + pipeId)

        # free only part of the vram
        free_vram(requiredVRAM, 0.3)

        pipeId_parts = pipeId.split('--')
        module_path = os.path.join('models', 'pipe', *pipeId_parts, 'index.py')
        spec = importlib.util.spec_from_file_location("module.name", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        pipes[pipeId] = module.load()
        load_pipe_queue.task_done()

        return pipes[pipeId]


def send(connection, msg):
    # log(f'send {msg}')
    return connection.sendall((msg + '\n').encode())

def receive_all(sock, buffer_size=4096):
    data = b''
    while True:
        part = sock.recv(buffer_size)
        data += part
        if len(part) < buffer_size:
            # either 0 or end of data
            break
    return data.decode().split('\n')

# handles lite/safe tasks
def handle_sock2(connection2):
    while True:
        messages = receive_all(connection2)
        for message in messages:
            if message:
                # log(f'received(2) {message}')        
                if is_json(message):
                    json_data = json.loads(message) 

                if 'type' in json_data and json_data['type'] == 'GET_PIPES_REQUEST':
                    response = json.dumps({
                        'type': 'GET_PIPES_RESPONSE', 
                        'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES,
                        'pipes': list(pipes.keys()),
                        'uuid': json_data['uuid']
                        })
                    send(connection2, response)

is_sock2_thread = True
if is_sock2_thread:
    is_sock2_thread = False
    connection2, client_address2 = sock2.accept()
    thread = threading.Thread(target=handle_sock2, args=(connection2,))
    thread.daemon = True
    thread.start()

# handles heavy tasks
connection, client_address = sock.accept()
try:
    while True:
        # Wait for a connection
        # Receive the data in small chunks
        messages = receive_all(connection)
        for message in messages:
            if message:
                # log(f'received {message}')        
                if is_json(message):
                    json_data = json.loads(message) 

                if 'type' in json_data and json_data['type'] == 'STATE_REQUEST':
                    response = json.dumps({
                        'type': 'STATE_RESPONSE', 
                        'uuid': json_data['uuid']
                        })
                    send(connection, response)

                elif 'type' in json_data and json_data['type'] == 'LOAD_PIPE_REQUEST':                    
                    p = load_pipe(json_data['pipeId'], int(json_data.get('requiredVRAM', '0'))) 
                    response = json.dumps({
                        'type': 'LOAD_PIPE_RESPONSE', 
                        'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES, 
                        'pipeId': json_data['pipeId'], 
                        'timeToLoadInRAM': p['loaded_in_ram'], 
                        'timeToLoadInVRAM': p['loaded_in_vram'], 
                        'uuid': json_data['uuid'],
                        })
                    send(connection, response)

                elif 'type' in json_data and json_data['type'] == 'DELETE_PIPE_REQUEST':
                    pipeId = json_data['pipeId']
                    if pipeId in pipes:    
                        pipe = pipes[pipeId]
                        del pipes[pipeId]
                        del pipe           
                        torch.cuda.empty_cache()
                        response = json.dumps({
                            'type': 'DELETE_PIPE_RESPONSE', 
                            'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES, 
                            'pipeId': pipeId, 
                            'uuid': json_data['uuid']
                            })
                    else:
                        response = json.dumps({
                            'type': 'DELETE_PIPE_RESPONSE', 
                            'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES, 
                            'pipeId': pipeId, 
                            'error': 'failure', 
                            'message': 'Model not found', 
                            'uuid': json_data['uuid']
                            })
                    send(connection, response)

                elif 'type' in json_data and json_data['type'] == 'CALL_PIPE_REQUEST':
                    try:
                        load_pipe(json_data['pipeId'], int(json_data.get('requiredVRAM', '0')))

                        if 'payload' in json_data and 'stream' in json_data['payload']:
                            streamer = JSONStreamer(connection, send, json_data['uuid'])
                            call_pipe(json_data['pipeId'], json_data['payload'], json_data['uuid'], streamer)
                        else:
                            response = call_pipe(json_data['pipeId'], json_data['payload'], json_data['uuid'])
                            send(connection, response)
                    except Exception as e:
                        response_data = {
                            'type': 'CALL_PIPE_RESPONSE',
                            'CUDA_VISIBLE_DEVICES': CUDA_VISIBLE_DEVICES,
                            'pipeId': json_data['pipeId'],
                            'uuid': json_data['uuid'],
                        }

                        if "CUDA out of memory" in str(e) and os.environ.get("RELOAD_ON_OUT_OF_MEMORY"):
                            # Delete all pipes to free up memory
                            for pipeId in list(pipes):
                                pipe = pipes[pipeId]
                                del pipes[pipeId]
                                del pipe
                            torch.cuda.empty_cache()

                            # Attempt to reload the last pipe
                            try:
                                pipe = load_pipe(json_data['pipeId'], int(json_data.get('requiredVRAM', '0')))
                                response_data['error'] = "Job failed (500)"
                            except Exception as e:
                                response_data['error'] = "Job failed (501)"
                                # print('Exiting process due to failure to reload the last pipe after freeing up memory.', flush=True)
                                # os._exit(1)  # Exit the process with an error code
                        else:
                            response_data['error'] = "job failed (502)" if "CUDA out of memory" in str(e) else str(e)

                        response = json.dumps(response_data)
                        send(connection, response)

                        # Check if the error code is 502 and exit the process
                        if response_data['error'] == "job failed (502)":
                            print('Exiting process due to job failure with error code 502.', flush=True)
                            os._exit(1)
                    
                    
finally:
    print('Close', flush=True)
    # Clean up the connection
    connection.close()