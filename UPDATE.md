# Reinstall ALL
```
cd ~/path/to/openkbs-server
rm -rf .env
python -m venv .env
source .env/bin/activate
# Then reinstall again nvidia or AMD pip packages from INSTALL.md
```

# Reinstall diffusers only
```
cd ~/path/to/openkbs-server
source .env/bin/activate
pip3 show diffusers
pip3 uninstall diffusers
pip3 install diffusers
pip3 show diffusers
```
