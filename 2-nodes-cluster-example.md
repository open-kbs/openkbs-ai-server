# Open Terminal Consoles
title1="s1"
title2="s2"
title3="f1"
title4="f2"
title5="git1"
title6="git2"
title7="smi"


cmd1="cd ~/proj/openkbs-ai-server && ./dev_start.sh"
cmd2="cd ~/proj/openkbs-ai-server2 && BACKEND_PORT=8081 ./dev_start.sh"
cmd3="cd ~/proj/openkbs-ai-server/fe && npm install && npm start"
cmd4="cd ~/proj/openkbs-ai-server2/fe && npm install && npm run start1"
cmd5="cd ~/proj/openkbs-ai-server && allin"
cmd6="cd ~/proj/openkbs-ai-server2 && git pull origin master"
cmd7="nvidia-smi"



gnome-terminal --tab --title="$title1" --command="bash -c '$cmd1; $SHELL'" \
               --tab --title="$title2" --command="bash -c '$cmd2; $SHELL'" \
               --tab --title="$title3" --command="bash -c '$cmd3; $SHELL'" \
               --tab --title="$title4" --command="bash -c '$cmd4; $SHELL'" \
               --tab --title="$title5" --command="bash -c '$cmd5; $SHELL'" \
               --tab --title="$title6" --command="bash -c '$cmd6; $SHELL'" \
               --tab --title="$title7" --command="bash -c '$cmd7; $SHELL'" 

