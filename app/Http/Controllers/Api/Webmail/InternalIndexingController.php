<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use App\Models\MailUser;
use App\Services\MaildirScannerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class InternalIndexingController extends Controller
{
    /**
     * POST /api/v1/internal/index-new-file
     *
     * Endpoint for Dovecot to push notification about new email.
     * Expects:
     * - email: User's email address
     * - path: Absolute path to the newly saved Maildir file (.eml)
     * - folder: Folder name (e.g. INBOX, Sent)
     */
    public function indexNewFile(Request $request, MaildirScannerService $scanner)
    {
        // Simple security: Allow only localhost
        if (!in_array($request->ip(), ['127.0.0.1', '::1'])) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $email = $request->input('email');
        $path = $request->input('path');
        $folder = $request->input('folder', 'INBOX');

        if (!$email || !$path || !file_exists($path)) {
            return response()->json(['error' => 'Invalid parameters or file not found'], 400);
        }

        $user = MailUser::where('email', $email)->first();
        if (!$user) {
            return response()->json(['error' => 'User not found'], 404);
        }

        try {
            // Find Dovecot UID from filename prefix
            $filename = basename($path);
            $baseFilename = explode(':', $filename)[0];

            // Re-use parser for single file
            $uid = $scanner->getUidFromBaseFilename(dirname(dirname($path)), $baseFilename);
            if (!$uid) {
                // If UID mapping not found yet, assign a temporary one or trigger full folder scan later
                $uid = "temp_" . time();
            }

            $scanner->indexRawEmailPublic($user, $path, $folder, $uid, $filename);

            Log::info("Real-time indexed new mail for {$email}: {$path}");

            return response()->json(['status' => 'success']);
        } catch (\Exception $e) {
            Log::error("Failed to index new mail {$path}: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
