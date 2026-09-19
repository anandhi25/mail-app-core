<?php

namespace App\Console\Commands;

use App\Jobs\SyncMailboxJob;
use App\Models\MailUser;
use App\Services\MailIndexService;
use Illuminate\Console\Command;
use Webklex\IMAP\Facades\Client;

class SyncMailCommand extends Command
{
    protected $signature = 'mail:sync {email?}';
    protected $description = 'Sync mail for a specific user or the first user';

    public function handle(MailIndexService $service)
    {
        $email = $this->argument('email');
        $user = $email ? MailUser::where('email', $email)->first() : MailUser::first();

        if (!$user) {
            $this->error("User tidak ditemukan.");
            return;
        }

        $this->info("Memulai sync untuk: {$user->email}");

        $pwd = cache()->get("imap_pwd_{$user->id}");
        if (!$pwd) {
            $this->error("Cache password kosong! Login ulang di webmail untuk mengisi cache.");
            return;
        }

        $this->info("Menghubungkan ke IMAP...");

        try {
            // Gunakan configurasi dari env
            $client = Client::make([
                "host" => config("imap.accounts.default.host", "127.0.0.1"),
                "port" => config("imap.accounts.default.port", 143),
                "encryption" => config("imap.accounts.default.encryption", false),
                "validate_cert" => config("imap.accounts.default.validate_cert", false),
                "username" => $user->email,
                "password" => decrypt($pwd),
                "protocol" => "imap",
            ]);
            $client->connect();
            $this->info("Koneksi IMAP berhasil.");

            $folder = $client->getFolder("INBOX");
            $this->info("Folder INBOX ditemukan.");

            $this->info("Mencoba query pesan...");
            $messages = $folder->query()->all()->limit(10)->leaveUnread()->get();
            $this->info("Query berhasil! Ditemukan {$messages->count()} pesan.");

            $this->info("Memasukkan ke MailIndex...");

            // Replicate the logic without the silent try-catch to see the actual error
            $synced = 0;
            foreach ($messages as $message) {
                try {
                    $uid = (string) $message->getUid();
                    $bodyText = ''; // simplify extraction to pinpoint error

                    try {
                        $plain = $message->getTextBody();
                        if ($plain && strlen(trim($plain)) > 10) {
                            $bodyText = mb_substr(trim($plain), 0, 50000);
                        } else {
                            $html = $message->getHTMLBody();
                            if ($html) {
                                $bodyText = mb_substr(trim(strip_tags($html)), 0, 50000);
                            }
                        }
                    } catch (\Throwable $e) {}

                    $toAddresses = [];
                    if ($message->getTo()) {
                        $toAddresses = array_map(fn ($a) => $a->mail ?? '', $message->getTo()->toArray());
                    }

                    $fromAddr = '';
                    $fromName = '';
                    $from = $message->getFrom();
                    if ($from && $from->count() > 0) {
                        $fromAddr = $from->first()->mail ?? '';
                        $fromName = $from->first()->personal ?? '';
                    }

                    $record = \App\Models\MailIndex::updateOrCreate(
                        [
                            'mail_user_id' => $user->id,
                            'folder' => "INBOX",
                            'uid' => $uid,
                        ],
                        [
                            'message_id' => (string) ($message->getMessageId() ?? ''),
                            'subject' => (string) ($message->getSubject() ?? '(no subject)'),
                            'from_address' => $fromAddr,
                            'from_name' => $fromName,
                            'to_addresses' => $toAddresses,
                            'body_text' => $bodyText,
                            'is_seen' => $message->hasFlag('Seen'),
                            'has_attachment' => $message->hasAttachments(),
                            'sent_at' => $message->getDate()->first()?->toDateTimeString(),
                        ]
                    );
                    $record->searchable();
                    $synced++;
                } catch (\Throwable $e) {
                    $this->error("Gagal insert pesan UID $uid: " . $e->getMessage());
                    $this->error("File: " . $e->getFile() . " baris " . $e->getLine());
                }
            }
            $this->info("Selesai! $synced pesan berhasil disinkronisasi.");

        } catch (\Exception $e) {
            $this->error("ERROR: " . $e->getMessage());
            $this->error($e->getTraceAsString());
        }
    }
}
