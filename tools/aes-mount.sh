#!/bin/bash
#
# Software License Agreement (MIT License)
#
# Author: Duke Fong <d@d-l.io>
#
# Image file <--> Directory, on-the-fly encryption tool
#
# Format: aes-cbc-plain
# KEY: sha256sum of password string
# IV: sector index (little-endian, sector size: 512 bytes)

XTERM=xterm
which gnome-terminal &> /dev/null && XTERM="gnome-terminal"
which xfce4-terminal &> /dev/null && XTERM="xfce4-terminal"

tty -s; [ $? -ne 0 ] && { $XTERM -e "bash -c \"$0 $@\""; exit; }
[ $UID -ne 0 ] && { echo "restart as root"; sudo _uid=$UID "$0" "$@"; exit $?; }
[ "$_uid" == "" ] && _uid=0
set -e

function exe() { echo "\$ $@"; "$@"; }

function anykey_exit() {
    [ "$1" == 0 ] && ecode=0 || ecode=1
    read -n1 -r -p "press any key to exit ($ecode)..."
    [ "$ecode" == 0 ] && exit || exit 1
}

if [[ "$1" == "" || "$1" == "-h" || "$1" == "--help" ]]; then
    echo "Usage:"
    echo "  $0 FILE                 : Toggle mount"
    echo "  $0 FILE [u]mount [PATH] : Mount / umount, or mount to PATH"
    echo "  $0 FILE new SIZE        : Create image file, units: K/M/G"
    echo "  $0 FILE shrink          : Shrink file size"
    echo "  $0 FILE expand SIZE     : Expand file to size"
    echo "  $0 FILE passwd          : Change file password"
    echo ""
    echo "You can drag an image file onto the script to run the toggle command."
    exit
fi

FILE_PATH="$(readlink -f "$1")"
FILE_DIR="$(dirname "$FILE_PATH")"
FILE_NAME="$(basename "$FILE_PATH")"
NAME="${FILE_NAME%.*}" # remove file extention

CMD="$2"
MAP_EXIST=0
MOUNT_DIR=""
if [ -b "/dev/mapper/$NAME" ]; then
    INFO="$(cryptsetup status "$NAME")"
    [[ ! "$INFO" =~ "$FILE_PATH" ]] && { echo "Name $NAME conflict!"; exit 1; }
    MAP_EXIST=1
    MOUNT_DIR="$(lsblk -o MOUNTPOINT -nr "/dev/mapper/$NAME")"
fi
[ "$NAME" == "" ] && { echo "Name empty!"; exit 1; }


if [ "$CMD" == "new" ]; then
    file_sz=`numfmt --from=iec "$3"`
    file_sz_iec=`numfmt --to=iec $file_sz`
    echo "new $FILE_PATH, size: $file_sz ($file_sz_iec)"
    [ "$((file_sz))" == "0" ] && { echo "file_sz wrong: $file_sz"; exit 1; }
    [ "$((file_sz % 512))" != "0" ] && { echo "file_sz is not multiple of 512"; exit 1; }
    exe dd if=/dev/zero of="$FILE_PATH" bs=512 count=0 seek=$((file_sz/512))
    exe cryptsetup create "$NAME" "$FILE_PATH" --hash sha256 --cipher aes-cbc-plain --key-size 256
    exe mkfs.ext4 /dev/mapper/"$NAME"
    exe cryptsetup remove "$NAME"
    echo "done"
    exit
fi


if [ "$CMD" == "shrink" ]; then
    [ "$MAP_EXIST" == "1" ] && { echo "please umount first"; exit 1; }
    exe cryptsetup create "$NAME" "$FILE_PATH" --hash sha256 --cipher aes-cbc-plain --key-size 256
    dumpe2fs "/dev/mapper/$NAME" > /dev/null || { exe cryptsetup remove "$NAME"; exit 1; }
    block_size=`dumpe2fs "/dev/mapper/$NAME" 2>&1 | grep "Block size:"`
    block_size=${block_size##* }
    block_count=`dumpe2fs "/dev/mapper/$NAME" 2>&1 | grep "Block count:"`
    block_count=${block_count##* }
    exe e2fsck -f "/dev/mapper/$NAME"
    exe resize2fs -M "/dev/mapper/$NAME"
    block_count_m=`dumpe2fs "/dev/mapper/$NAME" 2>&1 | grep "Block count:"`
    block_count_m=${block_count_m##* }
    exe cryptsetup remove "$NAME"
    echo "shrink: block_size: ${block_size}, block_count: ${block_count} -> ${block_count_m}"
    read -p "continue (Y/n)? "
    if [[ "$REPLY" =~ ^[Yy]$ || "$REPLY" == "" ]]; then
        exe dd if=/dev/zero of="$FILE_PATH" bs=${block_size} count=0 seek=${block_count_m}
        echo "done"
    fi
    exit
fi

if [[ "$CMD" == "expand" && "$3" != "" ]]; then
    file_sz=`stat -c '%s' $FILE_PATH`
    tgt_sz=`numfmt --from=iec $3`
    file_sz_iec=`numfmt --to=iec $file_sz`
    tgt_sz_iec=`numfmt --to=iec $tgt_sz`
    echo "expand: file_sz: $file_sz ($file_sz_iec) -> tgt_sz: $tgt_sz ($tgt_sz_iec)"
    [ "$MAP_EXIST" == "1" ] && { echo "please umount first"; exit 1; }
    [ "$((file_sz))" == "0" ] && { echo "file_sz wrong: $file_sz"; exit 1; }
    [ "$((file_sz % 512))" != "0" ] && echo "file_sz is not multiple of 512"
    [ "$((tgt_sz))" == "0" ] && { echo "tgt_sz wrong: $tgt_sz"; exit 1; }
    [ "$((tgt_sz % 512))" != "0" ] && { echo "file_sz is not multiple of 512"; exit 1; }
    [ "$((tgt_sz >= file_sz))" == "0" ] && { echo "tgt_sz must larger than file_sz"; exit 1; }
    
    read -p "continue (Y/n)? "
    if [[ "$REPLY" =~ ^[Yy]$ || "$REPLY" == "" ]]; then
        exe dd if=/dev/zero of="$FILE_PATH" bs=512 count=0 seek=$((tgt_sz/512))
        exe cryptsetup create "$NAME" "$FILE_PATH" --hash sha256 --cipher aes-cbc-plain --key-size 256
        exe e2fsck -f "/dev/mapper/$NAME"
        exe resize2fs "/dev/mapper/$NAME" # without -M
        exe cryptsetup remove "$NAME"
        echo "done"
    fi
    exit
fi

if [ "$CMD" == "passwd" ]; then
    file_sz=`stat -c '%s' $FILE_PATH`
    [ "$MOUNT_DIR" == "" ] && { echo "please mount first"; exit 1; }
    [ "$((file_sz))" == "0" ] && { echo "file_sz wrong: $file_sz"; exit 1; }
    [ "$((file_sz % 512))" != "0" ] && { echo "file_sz is not multiple of 512"; exit 1; }
    exe dd if=/dev/zero of="$FILE_PATH".tmp bs=512 count=0 seek=$((file_sz/512))
    echo "change passwd, please input new passwd:"
    exe cryptsetup create "$NAME".tmp "$FILE_PATH".tmp --hash sha256 --cipher aes-cbc-plain --key-size 256
    exe mkfs.ext4 /dev/mapper/"$NAME".tmp
    exe mkdir "$MOUNT_DIR".tmp
    exe mount "/dev/mapper/$NAME".tmp "$MOUNT_DIR".tmp
    exe cp -a "$MOUNT_DIR"/. "$MOUNT_DIR".tmp/ # include hidden files
    sync
    exe umount "$MOUNT_DIR".tmp
    exe cryptsetup remove "$NAME".tmp
    exe umount "$MOUNT_DIR"
    exe cryptsetup remove "$NAME"
    exe mv "$FILE_PATH" "$FILE_PATH".old
    exe mv "$FILE_PATH".tmp "$FILE_PATH"
    [ "$(ls -A "$MOUNT_DIR")" == "" ] && exe rm -r "$MOUNT_DIR"
    [ "$(ls -A "$MOUNT_DIR".tmp)" == "" ] && exe rm -r "$MOUNT_DIR".tmp
    echo "done"
    exit
fi

# toggle mount
[ "$CMD" == "" ] && { [ "$MAP_EXIST" == "0" ] && CMD="mount" || CMD="umount"; }
[ "$CMD" == "mount" ] && { [ "$3" != "" ] && MOUNT_DIR="$3" || MOUNT_DIR="$FILE_DIR/$NAME"; }

if [ "$CMD" == "mount" ]; then
    echo "do mount"
    [ "$MAP_EXIST" == "1" ] && { echo "/dev/mapper/$NAME already exist!"; anykey_exit; }
    [ ! -d "$MOUNT_DIR" ] && { exe mkdir "$MOUNT_DIR" || anykey_exit; }
    exe cryptsetup create "$NAME" "$FILE_PATH" --hash sha256 --cipher aes-cbc-plain --key-size 256
    exe mount "/dev/mapper/$NAME" "$MOUNT_DIR" && ret=0 || ret=1
    if [ $ret == 0 ]; then
        exe chown $_uid "$MOUNT_DIR"
        echo "succeeded"
    else
        [ "$(ls -A "$MOUNT_DIR")" == "" ] && exe rm -r "$MOUNT_DIR"
        exe cryptsetup remove "$NAME"
        anykey_exit
    fi

elif [ "$CMD" == "umount" ]; then
    echo "do umount"
    sync
    if [ "$MOUNT_DIR" != "" ]; then
        exe umount "$MOUNT_DIR" || anykey_exit
        [ "$(ls -A "$MOUNT_DIR")" == "" ] && exe rm -r "$MOUNT_DIR"
    else
        [[ -d "$FILE_DIR/$NAME" && "$(ls -A "$FILE_DIR/$NAME")" == "" ]] && exe rm -r "$FILE_DIR/$NAME"
    fi
    exe cryptsetup remove "$NAME"
    echo "done"
fi

anykey_exit 0

