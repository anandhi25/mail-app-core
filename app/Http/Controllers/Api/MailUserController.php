<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMailUserRequest;
use App\Http\Requests\UpdateMailUserRequest;
use App\Jobs\ProcessMailSync;
use App\Models\Domain;
use App\Models\MailUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MailUserController extends Controller
{
    public function index(Domain $domain): JsonResponse
    {
        return response()->json($domain->mailUsers()->with('latestSyncJob')->get());
    }

    public function store(StoreMailUserRequest $request, Domain $domain): JsonResponse
    {
        $mailUser = $domain->mailUsers()->create($request->validated());

        return response()->json($mailUser, 201);
    }

    public function show(MailUser $user): JsonResponse
    {
        return response()->json($user);
    }

    public function update(UpdateMailUserRequest $request, MailUser $user): JsonResponse
    {
        $user->update($request->validated());

        return response()->json($user);
    }

    public function destroy(MailUser $user): JsonResponse
    {
        $user->delete();

        return response()->json(null, 204);
    }

    public function triggerSync(Request $request, MailUser $user): JsonResponse
    {
        $request->validate([
            'source_host' => 'required|string',
            'source_port' => 'nullable|integer',
            'source_encryption' => 'nullable|string',
            'source_username' => 'required|string',
            'source_password' => 'required|string',
            'local_password' => 'required|string', // Admin must provide the new password just created
        ]);

        // Cancel previous pending jobs
        $user->syncJobs()->whereIn('status', ['pending', 'processing'])->update(['status' => 'failed', 'error_log' => 'Overridden by new sync request.']);

        $job = $user->syncJobs()->create([
            'source_host' => $request->input('source_host'),
            'source_port' => $request->input('source_port', 993),
            'source_encryption' => $request->input('source_encryption', 'ssl'),
            'source_username' => $request->input('source_username'),
            'source_password' => encrypt($request->input('source_password')),
            'local_password' => encrypt($request->input('local_password')),
            'status' => 'pending',
            'total_messages' => 0,
            'synced_messages' => 0,
        ]);

        // Dispatch background worker job
        ProcessMailSync::dispatch($job->id);

        return response()->json(['message' => 'Migration started in background', 'job' => $job]);
    }
}
