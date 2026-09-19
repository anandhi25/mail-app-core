<?php

namespace App\Services;

use App\Models\MailIndex;
use App\Models\MailUser;
use Illuminate\Support\Facades\Log;
use ZBateson\MailMimeParser\MailMimeParser;
use ZBateson\MailMimeParser\Message;

class MaildirScannerService
{
    private MailMimeParser $parser;

    public function __construct()
    {
        $this->parser = new MailMimeParser();
    }

    /**
     * Scan a specific Maildir folder for a user and index the emails.
     *
     * @param MailUser $user
     * @param string $systemPath e.g., /var/mail/vhosts/als.co.id/it.alsholdings/
     * @param string $folderName e.g., INBOX, Sent
     * @param bool $force Re-index if exists
     */
    public bool $debugMode = false;

    public function scanFolder(MailUser $user, string $systemPath, string $folderName, bool $force = false): int
    {
        $systemPath = rtrim($systemPath, '/');

        // Jika folderName = '*', kita scan semua folder!
        if ($folderName === '*') {
            $total = $this->scanFolder($user, $systemPath, 'INBOX', $force);

            $subdirs = scandir($systemPath);
            foreach ($subdirs as $dir) {
                if ($dir === '.' || $dir === '..') continue;

                // Cari folder Dovecot yang berawalan titik
                if (is_dir($systemPath . '/' . $dir) && str_starts_with($dir, '.')) {
                    $realFolderName = ltrim($dir, '.');
                    // Abaikan folder aneh atau system
                    if ($realFolderName === '' || $realFolderName === 'lock') continue;

                    $total += $this->scanFolder($user, $systemPath, $realFolderName, $force);
                }
            }
            return $total;
        }

        // Resolve Maildir paths (INBOX is at root level, others have dot prefixes)
        if (strtoupper($folderName) === 'INBOX') {
            $maildirPath = $systemPath;
        } else {
            // Map folder name to Dovecot dot-folder syntax (e.g. Sent -> .Sent)
            $folderMap = [
                'SENT' => '.Sent',
                'DRAFTS' => '.Drafts',
                'TRASH' => '.Trash',
                'SPAM' => '.Spam',
                'JUNK' => '.Spam',
            ];

            $upperName = strtoupper($folderName);
            $dotName = $folderMap[$upperName] ?? '.' . $folderName;
            $maildirPath = $systemPath . '/' . $dotName;
        }

        if (!is_dir($maildirPath)) {
            Log::warning("Maildir folder not found: {$maildirPath}");
            return 0;
        }

        // Parse Dovecot UID list mapping
        $uidMapping = $this->parseDovecotUidList($maildirPath);

        $indexedCount = 0;
        $directories = [$maildirPath . '/cur', $maildirPath . '/new'];

        foreach ($directories as $dir) {
            if (!is_dir($dir)) continue;

            $files = scandir($dir);
            foreach ($files as $file) {
                if ($file === '.' || $file === '..') continue;

                // Match up to the last colon that separates maildir flags (e.g. :2,S)
                // Dovecot unique identifier part is EVERYTHING before that colon.
                $baseFilename = $file;
                $lastColon = strrpos($file, ':');
                if ($lastColon !== false) {
                    $baseFilename = substr($file, 0, $lastColon);
                }

                // Find matching IMAP UID from dovecot-uidlist
                $uid = $uidMapping[$baseFilename] ?? null;

                if (!$uid) {
                    continue; // Skip if we can't map it to an IMAP UID
                }

                // Check if already indexed
                if (!$force && MailIndex::where('mail_user_id', $user->id)
                    ->where('folder', $folderName)
                    ->where('uid', $uid)
                    ->exists()) {

                    // Fast update seen status based on Maildir flags
                    $isSeen = str_contains($file, ':2,') && str_contains(explode(':2,', $file)[1] ?? '', 'S');
                    MailIndex::where('mail_user_id', $user->id)
                        ->where('folder', $folderName)
                        ->where('uid', $uid)
                        ->update(['is_seen' => $isSeen]);

                    continue;
                }

                $filePath = $dir . '/' . $file;

                try {
                    $this->indexRawEmail($user, $filePath, $folderName, $uid, $file);
                    $indexedCount++;
                    if ($indexedCount % 100 === 0) {
                        Log::info("Indexed {$indexedCount} files in {$folderName}");
                    }
                } catch (\Throwable $e) {
                    echo "ERROR on UID $uid: " . $e->getMessage() . "\n";
                    Log::error("Failed to index {$filePath}: " . $e->getMessage());
                }
            }
        }

        return $indexedCount;
    }

    /**
     * Read and parse dovecot-uidlist file to map filenames to IMAP UIDs.
     * Format example:
     * 1 1695034823 12345
     * 123 Wd123456789.M123456P1234.server:2,S
     */
    private function parseDovecotUidList(string $maildirPath): array
    {
        $uidListPath = $maildirPath . '/dovecot-uidlist';
        if (!file_exists($uidListPath)) {
            return [];
        }

        $mapping = [];
        $lines = file($uidListPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

        foreach ($lines as $line) {
            // Skip header lines (format version, etc)
            if (empty($line) || str_starts_with($line, '3 ') || str_starts_with($line, 'V')) {
                continue;
            }

            // A typical line: "123 Wfilename..." where 123 is UID
            $parts = explode(' ', $line, 2);
            if (count($parts) === 2 && is_numeric($parts[0])) {
                $uid = $parts[0];
                $fileMeta = $parts[1];

                // Remove leading letter/colon and strip off Maildir flags after ':'
                $cleanName = preg_replace('/^([a-zA-Z:]+)/', '', $fileMeta);
                $cleanName = explode(':', $cleanName)[0];

                $mapping[$cleanName] = $uid;
            }
        }

        return $mapping;
    }

    /**
     * Get UID from dovecot mapping
     */
    public function getUidFromBaseFilename(string $maildirPath, string $baseFilename): ?string
    {
        $mapping = $this->parseDovecotUidList($maildirPath);
        return $mapping[$baseFilename] ?? null;
    }

    /**
     * Parse raw .eml file and save to MailIndex
     */
    public function indexRawEmailPublic(MailUser $user, string $filePath, string $folderName, string $uid, string $filename): void
    {
        $this->indexRawEmail($user, $filePath, $folderName, $uid, $filename);
    }

    /**
     * Parse raw .eml file and save to MailIndex (Internal)
     */
    private function indexRawEmail(MailUser $user, string $filePath, string $folderName, string $uid, string $filename): void
    {
        // Read file using stream to save memory on large files
        $handle = fopen($filePath, 'r');
        $message = $this->parser->parse($handle, false);

        $isSeen = str_contains($filename, ':2,') && str_contains(explode(':2,', $filename)[1] ?? '', 'S');
        $hasAttachment = $message->getAttachmentCount() > 0;

        $bodyText = '';
        $plain = $message->getTextContent();
        if ($plain && strlen(trim($plain)) > 10) {
            $bodyText = mb_substr(trim($plain), 0, 50000);
        } else {
            $html = $message->getHtmlContent();
            if ($html) {
                $bodyText = mb_substr(trim(strip_tags($html)), 0, 50000);
            }
        }

        $toAddresses = [];
        $toHeader = $message->getHeader('To');
        if ($toHeader && method_exists($toHeader, 'getParts')) {
            foreach ($toHeader->getParts() as $part) {
                if (method_exists($part, 'getEmail') && $part->getEmail()) {
                    $toAddresses[] = $part->getEmail();
                }
            }
        }

        $fromAddress = '';
        $fromName = '';
        $fromHeader = $message->getHeader('From');
        if ($fromHeader && method_exists($fromHeader, 'getParts')) {
            $parts = $fromHeader->getParts();
            if (count($parts) > 0 && method_exists($parts[0], 'getEmail')) {
                $fromAddress = $parts[0]->getEmail();
                $fromName = $parts[0]->getName() ?? '';
            }
        }

        $dateHeader = $message->getHeaderValue('Date');
        $sentAt = $dateHeader ? date('Y-m-d H:i:s', strtotime($dateHeader)) : null;

        $record = MailIndex::updateOrCreate(
            [
                'mail_user_id' => $user->id,
                'folder' => $folderName,
                'uid' => $uid,
            ],
            [
                'message_id' => (string) ($message->getHeaderValue('Message-ID') ?? ''),
                'subject' => (string) ($message->getHeaderValue('Subject') ?? '(no subject)'),
                'from_address' => $fromAddress,
                'from_name' => $fromName,
                'to_addresses' => $toAddresses,
                'body_text' => $bodyText,
                'is_seen' => $isSeen,
                'has_attachment' => $hasAttachment,
                'sent_at' => $sentAt,
            ]
        );

        $record->searchable();

        // Close the stream ONLY after we are completely done reading from the lazy-loaded message
        fclose($handle);
    }
}
