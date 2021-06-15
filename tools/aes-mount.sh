#!/bin/bash
#
# Software License Agreement (MIT License)
#
# Author: Duke Fong <d@d-l.io>
#
# Image file <--> Directory, on-the-fly encryption tool
#

XTERM=xterm
which gnome-terminal &> /dev/null && XTERM="gnome-terminal"
which xfce4-terminal &> /dev/null && XTERM="xfce4-terminal"

tty -s; [ $? -ne 0 ] && { $XTERM -e "\"$0\""; exit; }
[ $UID -ne 0 ] && { echo "restart as root"; sudo _uid=$UID "$0" "$@"; exit $?; }
[ "$_uid" == "" ] && _uid=0
cd "$(dirname "$0")" # "$(dirname "$(realpath "$0")")"
set -e

function exe() { echo "\$ $@"; "$@"; }

CMD="$1"
function anykey_exit() {
    [ "$1" == 0 ] && ecode=0 || ecode=1
    [ "$CMD" == "" ] && read -n1 -r -p "press any key to exit ($ecode)..."
    [ "$ecode" == 0 ] && exit || exit 1
}

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    echo "usage:"
    echo "  $0                  : toggle mount and umount"
    echo "  $0 new IMG_NAME SIZE: create image, without '.img', units: K/M/G"
    echo "  $0 shrink           : shrink the size"
    echo "  $0 expand SIZE      : expand to size"
    echo "  $0 passwd           : change password"
    exit
fi


if [ "$1" == "new" ]; then
    NAME=$2
    IMG=$NAME.img
    file_sz=`numfmt --from=iec $3`
    file_sz_iec=`numfmt --to=iec $file_sz`
    echo "new $NAME.img, size: $file_sz ($file_sz_iec)"
    [ "$NAME" == "" ] && { echo "NAME empty"; exit 1; }
    [ "$((file_sz))" == "0" ] && { echo "file_sz wrong: $file_sz"; exit 1; }
    [ "$((file_sz % 512))" != "0" ] && { echo "file_sz is not multiple of 512"; exit 1; }
    exe dd if=/dev/zero of="$IMG" bs=512 count=0 seek=$((file_sz/512))
    exe cryptsetup create "$NAME" "$IMG" --hash sha256 --cipher aes-cbc-plain --key-size 256
    exe mkfs.ext4 /dev/mapper/"$NAME"
    exe cryptsetup remove "$NAME"
    echo "done"
    exit
fi


# only one img file can be stored in each directory
IMG=(*.img)
[[ ${#IMG[@]} -eq 1 && -f "$IMG" ]] || { echo "failed to get img name!"; anykey_exit; }

NAME="${IMG%.img}"
echo "NAME: $NAME"

if [ "$1" == "shrink" ]; then
    mountpoint -q "$NAME" && { echo "please umount first"; exit 1; }
    exe cryptsetup create "$NAME" "$IMG" --hash sha256 --cipher aes-cbc-plain --key-size 256
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
        exe dd if=/dev/zero of="$IMG" bs=${block_size} count=0 seek=${block_count_m}
        echo "done"
    fi
    exit
fi

if [[ "$1" == "expand" && "$2" != "" ]]; then
    file_sz=`stat -c '%s' $IMG`
    tgt_sz=`numfmt --from=iec $2`
    file_sz_iec=`numfmt --to=iec $file_sz`
    tgt_sz_iec=`numfmt --to=iec $tgt_sz`
    echo "expand: file_sz: $file_sz ($file_sz_iec) -> tgt_sz: $tgt_sz ($tgt_sz_iec)"
    mountpoint -q "$NAME" && { echo "please umount first"; exit 1; }
    [ "$((file_sz))" == "0" ] && { echo "file_sz wrong: $file_sz"; exit 1; }
    [ "$((file_sz % 512))" != "0" ] && echo "file_sz is not multiple of 512"
    [ "$((tgt_sz))" == "0" ] && { echo "tgt_sz wrong: $tgt_sz"; exit 1; }
    [ "$((tgt_sz % 512))" != "0" ] && { echo "file_sz is not multiple of 512"; exit 1; }
    [ "$((tgt_sz > file_sz))" == "0" ] && { echo "tgt_sz must larger than file_sz"; exit 1; }
    
    read -p "continue (Y/n)? "
    if [[ "$REPLY" =~ ^[Yy]$ || "$REPLY" == "" ]]; then
        exe dd if=/dev/zero of="$IMG" bs=512 count=0 seek=$((tgt_sz/512))
        exe cryptsetup create "$NAME" "$IMG" --hash sha256 --cipher aes-cbc-plain --key-size 256
        exe e2fsck -f "/dev/mapper/$NAME"
        exe resize2fs "/dev/mapper/$NAME" # without -M
        exe cryptsetup remove "$NAME"
        echo "done"
    fi
    exit
fi

if [ "$1" == "passwd" ]; then
    file_sz=`stat -c '%s' $IMG`
    mountpoint -q "$NAME" || { echo "please mount first"; exit 1; }
    [ "$((file_sz))" == "0" ] && { echo "file_sz wrong: $file_sz"; exit 1; }
    [ "$((file_sz % 512))" != "0" ] && { echo "file_sz is not multiple of 512"; exit 1; }
    exe dd if=/dev/zero of="$IMG".tmp bs=512 count=0 seek=$((file_sz/512))
    echo "change passwd, please input new passwd:"
    exe cryptsetup create "$NAME".tmp "$IMG".tmp --hash sha256 --cipher aes-cbc-plain --key-size 256
    exe mkfs.ext4 /dev/mapper/"$NAME".tmp
    exe mkdir "$NAME".tmp || { [ "$(ls -A "$NAME".tmp)" ] && { echo "folder $NAME.tmp not empty!"; exit 1; } }
    exe mount "/dev/mapper/$NAME".tmp "$NAME".tmp || { cryptsetup remove "$NAME".tmp; rm -r "$NAME".tmp; exit 1; }
    exe cp -a "$NAME"/* "$NAME".tmp/
    exe umount "$NAME".tmp || exit 1
    exe cryptsetup remove "$NAME".tmp
    exe umount "$NAME" || exit 1
    exe cryptsetup remove "$NAME"
    exe mv "$IMG" "$IMG".old
    exe mv "$IMG".tmp "$IMG"
    exe rm -r "$NAME" "$NAME".tmp
    echo "done"
    exit
fi

# toggle mount
if [[ "$1" == "" || "$1" == "mount" || "$1" == "umount" ]]; then
    mountpoint -q "$NAME" && is_mp=1 || is_mp=0
    if [[ ("$is_mp" == 1 && "$1" == "") || "$1" == "umount" ]]; then
        echo "do umount"
        exe umount "$NAME" || anykey_exit
        exe rm -r "$NAME"
        exe cryptsetup remove "$NAME"
        echo "done"
    elif [[ ("$is_mp" == 0 && "$1" == "") || "$1" == "mount" ]]; then
        echo "do mount"
        [ -e "/dev/mapper/$NAME" ] && { echo "/dev/mapper/$NAME already exist!"; anykey_exit; }
        exe mkdir "$NAME" || { [ "$(ls -A "$NAME")" ] && { echo "folder $NAME not empty!"; anykey_exit; } }
        exe cryptsetup create "$NAME" "$IMG" --hash sha256 --cipher aes-cbc-plain --key-size 256
        exe mount "/dev/mapper/$NAME" "$NAME" || { cryptsetup remove "$NAME"; rm -r "$NAME"; anykey_exit; }
        exe chown $_uid "$NAME"
        echo "succeeded"
    fi
fi

anykey_exit 0

