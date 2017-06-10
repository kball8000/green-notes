#!/bin/bash
echo Running app engine server...
#dev_appserver.py --port 8001 --admin_port 8003 -A kball-test-tools app.yaml worker.yaml
dev_appserver.py --port 8001 --admin_port 8003 -A green-kball-notes app.yaml
