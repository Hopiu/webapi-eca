#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
nodejs $DIR/js/webapi-eca | $DIR/node_modules/bunyan/bin/bunyan
