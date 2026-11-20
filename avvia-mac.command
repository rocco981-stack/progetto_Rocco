#!/bin/bash
cd "$(dirname "$0")/app" || exit 1
PORT=47800
( sleep 1; open "http://127.0.0.1:$PORT/" ) &
echo "BeCity in esecuzione su http://127.0.0.1:$PORT  (chiudi questa finestra per terminare)"
exec python3 -m http.server $PORT --bind 127.0.0.1
