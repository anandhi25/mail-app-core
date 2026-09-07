<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMailUserRequest;
use App\Http\Requests\UpdateMailUserRequest;
use App\Models\Domain;
use App\Models\MailUser;
use Illuminate\Http\JsonResponse;

class MailUserController extends Controller
{
    public function index(Domain $domain): JsonResponse
    {
        return response()->json($domain->mailUsers);
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
}
