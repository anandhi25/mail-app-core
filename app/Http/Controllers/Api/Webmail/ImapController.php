<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use App\Jobs\MaildirIndexJob;
use App\Models\MailIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Webklex\IMAP\Facades\Client;
use Webklex\PHPIMAP\Folder;

class ImapController extends Controller
{
    /**
     * Get IMAP Client.
     * In a real webmail app, you'd dynamically pass the user's email/password
     * instead of relying on the default .env account.
     */
    private function getClient(Request $request): \Webklex\PHPIMAP\Client
    {

        $user = $request->user();
        $password = cache()->get("imap_pwd_{$user->id}");
        if (! $password) {
            throw new \Exception('IMAP password not found in session.');
        }
        $password = decrypt($password);

        $client = Client::make([
            'host' => config('imap.accounts.default.host'),
            'port' => config('imap.accounts.default.port'),
            'encryption' => config('imap.accounts.default.encryption'),
            'validate_cert' => config('imap.accounts.default.validate_cert'),
            'username' => $user->email,
            'password' => $password,
            'protocol' => 'imap',
        ]);
        $client->connect();
        $this->ensureStandardFolders($client);

        return $client;
    }

    private function ensureStandardFolders(\Webklex\PHPIMAP\Client $client): void
    {
        try {
            $existing = $client->getFolders(false)->map(fn ($f) => $f->full_name)->toArray();
            $required = array_values(config('imap.options.common_folders', []));

            foreach ($required as $folder) {
                if ($folder !== 'INBOX' && ! in_array($folder, $existing, true)) {
                    $client->createFolder($folder);
                }
            }
        } catch (\Exception) {
            // Non-fatal: continue even if folder creation fails on this server
        }
    }

    /**
     * Resolve a folder by name, with fallback to case-insensitive full_name match.
     * Handles servers with different hierarchy delimiters (e.g. "INBOX.Sent" vs "Sent").
     */
    private function resolveFolder(\Webklex\PHPIMAP\Client $client, string $folderName): Folder
    {
        try {
            $folder = $client->getFolder($folderName);
            if ($folder) {
                return $folder;
            }
        } catch (\Exception) {
            // Fall through to scan-based resolution
        }

        // Scan all folders and match by name or full_name (case-insensitive)
        $allFolders = $client->getFolders(false);
        $needle = strtolower($folderName);

        foreach ($allFolders as $candidate) {
            if (strtolower($candidate->name) === $needle || strtolower($candidate->full_name) === $needle) {
                return $candidate;
            }
        }

        // Last resort: match by the last segment of the full_name
        foreach ($allFolders as $candidate) {
            $parts = explode($candidate->delimiter ?? '.', $candidate->full_name);
            if (strtolower(end($parts)) === $needle) {
                return $candidate;
            }
        }

        throw new \Exception("Folder \"{$folderName}\" not found on this server.");
    }

    /**
     * List all folders (mailboxes).
     */
    public function getFolders(Request $request): JsonResponse
    {
        $user = $request->user();
        try {
            $client = $this->getClient($request);
            $folders = $client->getFolders();

            $result = [];
            foreach ($folders as $folder) {
                // Fetch counts directly from our indexed database for blazing fast performance
                $messagesCount = MailIndex::where('mail_user_id', $user->id)
                    ->where('folder', $folder->name)
                    ->count();

                $unreadCount = MailIndex::where('mail_user_id', $user->id)
                    ->where('folder', $folder->name)
                    ->where('is_seen', false)
                    ->count();

                $result[] = [
                    'name' => $folder->name,
                    'full_name' => $folder->full_name,
                    'messages_count' => $messagesCount,
                    'unread_count' => $unreadCount,
                ];
            }

            return response()->json(['folders' => $result]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * List emails in a specific folder.
     */
    public function getMessages(Request $request): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'page' => 'integer|min:1',
            'per_page' => 'integer|min:1|max:50',
        ]);

        $folderName = $request->input('folder', 'INBOX');
        $page = $request->input('page', 1);
        $perPage = $request->input('per_page', 15);
        $user = $request->user();

        try {
            // If user has never been indexed, trigger mass-index via queue job
            $hasAnyIndex = MailIndex::where('mail_user_id', $user->id)->exists();
            if (! $hasAnyIndex) {
                MaildirIndexJob::dispatch($user->id, '*', true);

                return response()->json([
                    'folder' => $folderName,
                    'page' => $page,
                    'total' => 0,
                    'messages' => [],
                    'indexing' => true,
                    'message' => 'Mailbox sedang diproses, silakan refresh dalam beberapa detik.',
                ]);
            }

            // Retrieve from database instead of IMAP for instant loading
            $query = MailIndex::where('mail_user_id', $user->id)
                ->where('folder', $folderName)
                ->orderBy('sent_at', 'desc')
                ->orderBy('id', 'desc');

            $total = $query->count();

            $messages = $query->offset(($page - 1) * $perPage)
                ->limit($perPage)
                ->get();

            $result = [];
            foreach ($messages as $message) {
                $result[] = [
                    'uid' => $message->uid,
                    'subject' => $message->subject,
                    'from' => $message->from_address,
                    'date' => $message->sent_at,
                    'is_seen' => (bool) $message->is_seen,
                    'has_attachments' => (bool) $message->has_attachment,
                ];
            }

            return response()->json([
                'folder' => $folderName,
                'page' => $page,
                'total' => $total,
                'messages' => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Read a single email detail.
     */
    public function getMessageDetail(Request $request, $uid): JsonResponse
    {
        $request->validate(['folder' => 'required|string']);
        $folderName = $request->input('folder');

        try {
            $client = $this->getClient($request);
            $folder = $this->resolveFolder($client, $folderName);

            // Set options properly to parse body completely but efficiently
            $message = $folder->query()
                ->setFetchBody(true)
                ->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            // Mark as read on IMAP server and sync to local database
            $message->setFlag('seen');
            MailIndex::where('mail_user_id', $request->user()->id)
                ->where('folder', $folderName)
                ->where('uid', $uid)
                ->update(['is_seen' => true]);

            $attachments = [];
            foreach ($message->getAttachments() as $attachment) {
                // Ignore small inline structural attachments if needed, but here we take all
                $attachments[] = [
                    'name' => $attachment->getName(),
                    'mime' => $attachment->getMimeType(),
                    'content' => base64_encode($attachment->getContent()),
                ];
            }

            return response()->json([
                'uid' => $message->getUid(),
                'subject' => $message->getSubject()[0] ?? '',
                'from' => $message->getFrom()[0]->mail ?? '',
                'to' => array_map(fn ($t) => $t->mail, $message->getTo()->toArray()),
                'date' => $message->getDate()[0]->format('Y-m-d H:i:s'),
                'body_html' => $message->getHTMLBody(),
                'body_text' => $message->getTextBody(),
                'attachments' => $attachments,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete an email (Move to Trash).
     */
    public function deleteMessage(Request $request, $uid): JsonResponse
    {
        $request->validate(['folder' => 'required|string']);
        $folderName = $request->input('folder');

        try {
            $client = $this->getClient($request);
            $folder = $this->resolveFolder($client, $folderName);
            $message = $folder->query()->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            // If already in Trash, delete permanently; otherwise move to Trash
            if (strtolower($folderName) === 'trash') {
                $message->delete(true);
            } else {
                $message->move('Trash');
            }

            return response()->json(['message' => 'Message deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete multiple messages by UID in bulk.
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'uids' => 'required|array|min:1',
            'uids.*' => 'required|integer',
        ]);

        $folderName = $request->input('folder');
        $uids = $request->input('uids');

        try {
            $client = $this->getClient($request);
            $folder = $this->resolveFolder($client, $folderName);

            $deleted = 0;
            $isPermanent = strtolower($folderName) === 'trash';
            foreach ($uids as $uid) {
                $message = $folder->query()->getMessageByUid($uid);
                if ($message) {
                    if ($isPermanent) {
                        $message->delete(true);
                    } else {
                        $message->move('Trash');
                    }
                    $deleted++;
                }
            }

            return response()->json(['message' => "{$deleted} message(s) deleted successfully.", 'deleted' => $deleted]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Mark a message as read or unread.
     */
    public function markReadStatus(Request $request, $uid): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'is_seen' => 'required|boolean',
        ]);

        $folderName = $request->input('folder');
        $isSeen = $request->boolean('is_seen');

        try {
            $client = $this->getClient($request);
            $folder = $this->resolveFolder($client, $folderName);
            $message = $folder->query()->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            if ($isSeen) {
                $message->setFlag('seen');
            } else {
                $message->unsetFlag('seen');
            }

            // Sync status to local database so inbox list reflects the change immediately
            MailIndex::where('mail_user_id', $request->user()->id)
                ->where('folder', $folderName)
                ->where('uid', $uid)
                ->update(['is_seen' => $isSeen]);

            return response()->json(['message' => 'Status updated', 'is_seen' => $isSeen]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Move an email to another folder.
     */
    public function moveMessage(Request $request, $uid): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'destination_folder' => 'required|string',
        ]);

        $folderName = $request->input('folder');
        $destinationFolder = $request->input('destination_folder');

        try {
            $client = $this->getClient($request);
            $folder = $this->resolveFolder($client, $folderName);
            $message = $folder->query()->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            $message->move($destinationFolder);

            return response()->json(['message' => 'Message moved successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
