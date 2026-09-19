<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Meilisearch\Client as MeilisearchClient;

class SetupMeilisearchIndex extends Command
{
    protected $signature = 'meilisearch:setup';

    protected $description = 'Configure Meilisearch index settings for mail_messages (filterable, sortable, searchable attributes)';

    public function handle(): int
    {
        $host = config('scout.meilisearch.host');
        $key = config('scout.meilisearch.key', '');

        $client = new MeilisearchClient($host, $key ?: null);

        try {
            $client->health();
        } catch (\Throwable $e) {
            $this->error("Cannot connect to Meilisearch at {$host}: {$e->getMessage()}");
            $this->line('Make sure Meilisearch is running: meilisearch --master-key="" &');

            return self::FAILURE;
        }

        $index = $client->index('mail_messages');

        // Which fields can be used in filter expressions
        $index->updateFilterableAttributes([
            'mail_user_id',
            'folder',
            'is_seen',
            'has_attachment',
            'sent_at',
        ]);

        // Which fields are searched (ranked by order)
        $index->updateSearchableAttributes([
            'subject',
            'from_name',
            'from_address',
            'body_text',
            'to_addresses',
        ]);

        // Which fields can be sorted
        $index->updateSortableAttributes(['sent_at']);

        // Ranking rules — boost subject matches above body
        $index->updateRankingRules([
            'words',
            'typo',
            'proximity',
            'attribute',
            'sort',
            'exactness',
        ]);

        $this->info('Meilisearch index "mail_messages" configured successfully.');
        $this->line('Filterable: mail_user_id, folder, is_seen, has_attachment, sent_at');
        $this->line('Searchable: subject, from_name, from_address, body_text, to_addresses');

        return self::SUCCESS;
    }
}
