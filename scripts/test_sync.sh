#!/bin/bash
export DIVE_ROOT="$(pwd)"
source scripts/dive-modules/common.sh
source scripts/dive-modules/spoke/spoke-deploy.sh

_sync_spoke_client_secret "POL" "instances/pol/.env"
