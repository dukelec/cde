#!/bin/bash

# for subdir: ./gen_sw.sh /cde

cd "$(dirname "$0")/.."

files="$(find ./ -not -path '*/\.*' -type f)"

echo "$files" | while read -r line; do
    line="${line:1}"
    file="$line"
    [[ "$line" == "/httpd.conf" ]] && continue
    [[ "$line" == "/Readme.md" ]] && continue
    [[ "$line" == "/sw.js" ]] && continue
    [[ "$line" =~ ^"/tools/" ]] && continue
    [[ "$line" =~ ^"/cgi-bin/" ]] && continue
    [[ "$line" == "/index.html" ]] && line="/"
    echo "    \"$1$line\" : \"$(sha256sum "./$file" | awk '{ print $1 }')\","
done

