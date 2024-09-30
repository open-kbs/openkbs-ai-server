# Apt Get Install
```
sudo apt-get update
sudo apt install ubuntu-desktop python3.10-venv curl python-is-python3 pip ffmpeg
```


# Install Nvidia Drivers (Nvidia only)
```
sudo add-apt-repository  ppa:graphics-drivers/ppa
sudo apt install nvidia-driver-535
```

# Install ROCm Drivers on Ubuntu 22.04 (AMD only)
```
wget https://repo.radeon.com/amdgpu-install/5.3/ubuntu/jammy/amdgpu-install_5.3.50300-1_all.deb
sudo apt-get install ./amdgpu-install_5.3.50300-1_all.deb

# Add repositories
echo 'deb [arch=amd64] https://repo.radeon.com/amdgpu/latest/ubuntu jammy main' | sudo tee /etc/apt/sources.list.d/amdgpu.list
echo 'deb [arch=amd64] https://repo.radeon.com/rocm/apt/debian/ jammy main' | sudo tee /etc/apt/sources.list.d/rocm.list
sudo apt-get update

# Install Kernel mode (That may already be installed using the above commands)
sudo apt install amdgpu-dkms

# Reboot
sudo reboot

sudo apt install rocm-hip-libraries
sudo /opt/rocm-6.0.0/bin/rocm-smi

sudo ln -s /opt/rocm-6.0.0/bin/rocm-smi /usr/bin/rocm-smi


# Test
rocm-smi --showtemp --showuse --json --showpower --showfan --showsclkrange --showuniqueid --showbus --showpagesinfo --showmemuse --showmeminfo vram

```

``` sudo reboot ```

# Install Node
```

mkdir proj
cd proj
curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash
source ~/.bashrc
nvm install 18
```

# Add this key to github to have access to openkbs-server repo
```ssh-keygen -b 2048 -t rsa```

# Passwordless sudo
## open sudoers
```sudo visudo```

## Replace yourusername and add the following line after the last line (it is important to be after the last line)
```
yourusername ALL=(ALL) NOPASSWD: /usr/bin/nvidia-smi, /sbin/reboot
```

Checkout, Build and Run
```
git clone git@github.com:proofofrandomness/servers.git
git clone git@github.com:proofofrandomness/openkbs-server.git
cd openkbs-server2
cd cluster
npm i
cd ..
python -m venv .env
source .env/bin/activate

# Python Libs for ROCm (AMD Only)
####################
sudo apt-get install -y libjpeg-dev libpng-dev
pip3 install wheel setuptools
pip3 install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/rocm6.1/
pip3 install -r ./models/requirements_AMD.txt

# old version
# wget https://repo.radeon.com/rocm/manylinux/rocm-rel-5.7/torch-2.0.1%2Brocm5.7-cp310-cp310-linux_x86_64.whl
# wget https://repo.radeon.com/rocm/manylinux/rocm-rel-5.7/torchvision-0.15.2%2Brocm5.7-cp310-cp310-linux_x86_64.whl
# pip3 install --force-reinstall torch-2.0.1+rocm5.7-cp310-cp310-linux_x86_64.whl torchvision-0.15.2+rocm5.7-cp310-cp310-linux_x86_64.whl
# rm torch-2.0.1+rocm5.7-cp310-cp310-linux_x86_64.whl torchvision-0.15.2+rocm5.7-cp310-cp310-linux_x86_64.whl

####################

# Python Libs for NVIDIA (NVIDIA Only)
####################
pip3 install torch
pip3 install -r ./models/requirements_NVIDIA.txt
####################

huggingface-cli login
npm install -g pm2 nodemon react-scripts

# Replace "g4" with the CURRENT server 
cp ../servers/g4/gitignored_start.sh ./
chmod +x ./gitignored_start.sh
./gitignored_start.sh
```

# Register KBS-server username and login
```
http://KBSServer/register
```

# Connect KBS-server to other servers in the cluster

# KBS-server Install AI Models

# Restart Cluster Servers to connect

Run on startup
```
pm2 save
pm2 startup

# execute the command from the output
```

SSL
```
sudo apt-get remove certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo apt-get install nginx
sudo certbot --nginx
```

