<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
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
        try {
            $client = $this->getClient($request);
            $folders = $client->getFolders();

            $result = [];
            foreach ($folders as $folder) {
                try {
                    $messagesCount = $folder->messages()->whereAll()->count();
                    $unreadCount = $folder->messages()->whereUnseen()->count();
                } catch (\Exception) {
                    $messagesCount = 0;
                    $unreadCount = 0;
                }

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

        try {
            $client = $this->getClient($request);
            $folder = $this->resolveFolder($client, $folderName);

            // Check if folder is empty first
            $total = $folder->messages()->whereAll()->count();
            if ($total === 0) {
                return response()->json([
                    'folder' => $folderName,
                    'page' => $page,
                    'total' => 0,
                    'messages' => [],
                ]);
            }

            $messages = $folder->query()
                ->whereAll()
                ->setFetchBody(false)
                ->setFetchOrderDesc()
                ->limit($perPage, $page)
                ->get();

            $result = [];
            foreach ($messages as $message) {
                $result[] = [
                    'uid' => $message->getUid(),
                    'subject' => $message->getSubject()[0] ?? '(No Subject)',
                    'from' => $message->getFrom()[0]->mail ?? '',
                    'date' => $message->getDate()[0]->format('Y-m-d H:i:s'),
                    'is_seen' => $message->hasFlag('seen'),
                    'has_attachments' => $message->hasAttachments(),
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

            // Mark as read
            $message->setFlag('seen');

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
