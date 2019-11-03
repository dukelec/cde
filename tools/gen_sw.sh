#!/bin/bash

# for subdir: ./gen_sw.sh /cde

cd "$(dirname "$0")/.."

files="$(find ./ -not -path '*/\.*' -type f)"

echo "    \"$1/\","
echo "$files" | while read -r line; do
    line="${line:1}"
    [[ "$line" == "/httpd.conf" ]] && continue
    [[ "$line" == "/index.html" ]] && continue
    [[ "$line" == "/Readme.md" ]] && continue
    [[ "$line" == "/sw.js" ]] && continue
    [[ "$line" =~ ^"/tools/" ]] && continue
    [[ "$line" =~ ^"/cgi-bin/" ]] && continue
    echo "    \"$1$line\","
done

