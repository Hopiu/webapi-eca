DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Started listening on file changes to compile them!..."
coffee -wc -o $DIR/webpages/handlers/js $DIR/webpages/handlers/coffee
