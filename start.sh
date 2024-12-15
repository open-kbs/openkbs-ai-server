source .env/bin/activate
pm2 start cluster/src/index.js --node-args="--max-old-space-size=18096"
cd fe
npm i
pm2 start npm --name "server fe" -- start

