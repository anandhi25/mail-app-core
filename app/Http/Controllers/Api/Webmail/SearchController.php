<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use App\Jobs\SyncMailboxJob;
use App\Models\MailIndex;
use App\Services\MailIndexService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __construct(private readonly MailIndexService $service) {}

    /**
     * GET /api/v1/webmail/search
     *
     * Query params:
     *   q            string  required  Search query
     *   folder       string  optional  Filter by folder name
     *   is_seen      bool    optional  Filter by read status
     *   has_attachment bool  optional  Filter by attachment presence
     *   limit        int     optional  Max results (default 20, max 50)
     */
    public function search(Request $request): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:1|max:200',
            'folder' => 'nullable|string|max:128',
            'is_seen' => 'nullable|boolean',
            'has_attachment' => 'nullable|boolean',
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $user = $request->user();
        $query = trim($request->string('q'));
        $limit = (int) $request->input('limit', 20);

        $filters = array_filter([
            'folder' => $request->input('folder'),
            'is_seen' => $request->has('is_seen') ? $request->boolean('is_seen') : null,
            'has_attachment' => $request->has('has_attachment') ? $request->boolean('has_attachment') : null,
        ], fn ($v) => $v !== null);

        // If Meilisearch has no documents yet for this user, trigger a background sync
        $hasIndexed = MailIndex::where('mail_user_id', $user->id)->exists();
        if (! $hasIndexed) {
            SyncMailboxJob::dispatch($user->id, 'INBOX', 200);

            return response()->json([
                'results' => [],
                'total' => 0,
                'indexing' => true,
                'message' => 'Mailbox is being indexed. Please try again in a few seconds.',
            ]);
        }

        try {
            $results = $this->service->search($user, $query, $filters, $limit);

            return response()->json([
                'results' => $results->map(fn (MailIndex $m) => [
                    'id' => $m->id,
                    'uid' => $m->uid,
                    'folder' => $m->folder,
                    'subject' => $m->subject,
                    'from_address' => $m->from_address,
                    'from_name' => $m->from_name,
                    'is_seen' => $m->is_seen,
                    'has_attachment' => $m->has_attachment,
                    'sent_at' => $m->sent_at?->toIso8601String(),
                    'snippet' => mb_substr(strip_tags($m->body_text ?? ''), 0, 160),
                ]),
                'total' => $results->count(),
                'indexing' => false,
            ]);
        } catch (\Throwable $e) {
            // Meilisearch not running or connection error
            return response()->json([
                'results' => [],
                'total' => 0,
                'indexing' => false,
                'error' => 'Search service unavailable. Please ensure Meilisearch is running.',
            ], 503);
        }
    }

    /**
     * POST /api/v1/webmail/search/sync
     *
     * Trigger a full mailbox re-index for the current user.
     */
    public function triggerSync(Request $request): JsonResponse
    {
        $request->validate([
            'folder' => 'nullable|string|max:128',
        ]);

        $user = $request->user();
        $folder = $request->input('folder', 'INBOX');

        SyncMailboxJob::dispatch($user->id, $folder, 500);

        return response()->json(['message' => "Sync queued for folder: {$folder}"]);
    }
}
