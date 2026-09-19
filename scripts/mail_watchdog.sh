#!/bin/bash

# Folder root dimana semua maildir berada
WATCH_DIR="/var/mail/vhosts"
LARAVEL_URL="http://127.0.0.1/api/v1/internal/index-new-file"

# Pastikan inotifywait terinstall
if ! command -v inotifywait &> /dev/null; then
    echo "inotify-tools is not installed. Please install it first:"
    echo "sudo apt-get install inotify-tools"
    exit 1
fi

echo "Starting Maildir Watchdog on $WATCH_DIR..."

# Memantau direktori secara rekursif, mencari event "moved_to" dan "close_write"
# yang artinya file baru selesai dibuat atau dipindah ke direktori tersebut.
inotifywait -m -r -e moved_to -e close_write --format '%w%f' "$WATCH_DIR" | while read -r FILE_PATH
do
    # Kita hanya peduli jika file masuk ke folder "new" atau "cur"
    if [[ "$FILE_PATH" == */new/* ]] || [[ "$FILE_PATH" == */cur/* ]]; then
        
        # Ekstrak informasi dari Path.
        # Contoh Path: /var/mail/vhosts/als.co.id/it.alsholdings/new/1789514636...
        
        # Menggunakan regex untuk mengekstrak DOMAIN dan USERNAME dari path
        # Asumsi struktur: /var/mail/vhosts/<domain>/<username>/[folder_path]
        
        RELATIVE_PATH=${FILE_PATH#"$WATCH_DIR/"}
        DOMAIN=$(echo "$RELATIVE_PATH" | cut -d'/' -f1)
        USERNAME=$(echo "$RELATIVE_PATH" | cut -d'/' -f2)
        
        EMAIL="${USERNAME}@${DOMAIN}"
        
        # Mendapatkan folder spesifik (misal: INBOX, .Sent, .Trash)
        # Jika file langsung di bawah username/new atau username/cur, maka itu INBOX
        DIR_PATH=$(dirname "$FILE_PATH")
        FOLDER_DIR_NAME=$(basename "$DIR_PATH") # "new" or "cur"
        PARENT_DIR_NAME=$(basename "$(dirname "$DIR_PATH")") # "it.alsholdings" or ".Sent"
        
        FOLDER="INBOX"
        if [[ "$PARENT_DIR_NAME" == .* ]]; then
            # Hapus titik di depan
            FOLDER="${PARENT_DIR_NAME#.}"
        fi

        echo "Detected new mail: $FILE_PATH"
        echo "Sending to Laravel API -> User: $EMAIL | Folder: $FOLDER"

        # Panggil endpoint internal Laravel secara asinkron (background) agar tidak mem-block watchdog
        curl -X POST "$LARAVEL_URL" \
             -H "Content-Type: application/json" \
             -H "Accept: application/json" \
             -d "{
                   \"email\": \"$EMAIL\",
                   \"path\": \"$FILE_PATH\",
                   \"folder\": \"$FOLDER\"
                 }" \
             --silent --output /dev/null &
    fi
done
