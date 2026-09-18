<?php

namespace App\Observers;

use App\Models\MailUser;

class MailUserObserver
{
    public function created(MailUser $mailUser): void
    {
        $this->createMaildir($mailUser);
    }

    private function createMaildir(MailUser $mailUser): void
    {
        [$username, $domain] = explode('@', $mailUser->email);
        $baseDir = "/var/mail/vhosts/{$domain}/{$username}/Maildir";

        $script = "sudo mkdir -p {$baseDir}/cur {$baseDir}/new {$baseDir}/tmp "
            ."{$baseDir}/.Drafts/cur {$baseDir}/.Drafts/new {$baseDir}/.Drafts/tmp "
            ."{$baseDir}/.Sent/cur {$baseDir}/.Sent/new {$baseDir}/.Sent/tmp "
            ."{$baseDir}/.Trash/cur {$baseDir}/.Trash/new {$baseDir}/.Trash/tmp "
            ."{$baseDir}/.Spam/cur {$baseDir}/.Spam/new {$baseDir}/.Spam/tmp "
            ."&& sudo chown -R vmail:vmail /var/mail/vhosts/{$domain}/{$username}";

        exec($script);
    }

    private function chownRecursive(string $path, int $uid, int $gid): void
    {
        exec('sudo chown -R vmail:vmail '.escapeshellarg($path));
        chown($path, $uid);
        chgrp($path, $gid);

        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($path, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($items as $item) {
            chown($item->getPathname(), $uid);
            chgrp($item->getPathname(), $gid);
        }
    }
}
