<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class DiagnoseMaildirCommand extends Command
{
    protected $signature = 'mail:diagnose {path}';
    protected $description = 'Diagnose Maildir structure for a given user path';

    public function handle()
    {
        $path = rtrim($this->argument('path'), '/');

        $this->info("Mendiagnosis path: {$path}");

        if (!is_dir($path)) {
            $this->error("Path tidak ada atau bukan direktori!");
            return;
        }

        // Cek struktur root (INBOX)
        $this->checkFolder($path, "INBOX (Root)");

        // Scan subdirectory
        $subdirs = scandir($path);
        foreach ($subdirs as $dir) {
            if ($dir === '.' || $dir === '..') continue;

            if (is_dir($path . '/' . $dir) && str_starts_with($dir, '.')) {
                $this->checkFolder($path . '/' . $dir, "Folder: " . $dir);
            }
        }
    }

    private function checkFolder($path, $label)
    {
        $cur = $path . '/cur';
        $new = $path . '/new';
        $uidlist = $path . '/dovecot-uidlist';

        $countCur = is_dir($cur) ? count(scandir($cur)) - 2 : "N/A (dir not found)";
        $countNew = is_dir($new) ? count(scandir($new)) - 2 : "N/A (dir not found)";

        $uidFound = file_exists($uidlist) ? "Ya" : "Tidak";

        $this->line("\n--- {$label} ---");
        $this->line("Path: {$path}");
        $this->line("File di /cur : {$countCur}");
        $this->line("File di /new : {$countNew}");
        $this->line("Ada dovecot-uidlist : {$uidFound}");

        // Peek dovecot-uidlist if exists
        if (file_exists($uidlist)) {
            $lines = file($uidlist);
            $this->line("Isi uidlist (3 baris pertama):");
            foreach (array_slice($lines, 0, 3) as $line) {
                $this->line("  > " . trim($line));
            }
        }

        // Peek one email file to check filename pattern
        if (is_dir($cur) && is_numeric($countCur) && $countCur > 0) {
            $files = array_diff(scandir($cur), ['.', '..']);
            $first = reset($files);
            $this->line("Contoh nama file email di /cur: {$first}");
        }
    }
}
