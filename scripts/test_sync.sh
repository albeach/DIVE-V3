#!/bin/bash
DIVE_ROOT="$(pwd)"
export DIVE_ROOT
source scripts/dive-modules/common.sh
source scripts/dive-modules/spoke/spoke-deploy.sh

_sync_spoke_client_secret "POL" "instances/pol/.env"
